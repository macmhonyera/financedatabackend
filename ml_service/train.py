"""Train script for credit scoring model.
Reads data from Postgres (env vars), computes simple features from loans/payments/users,
trains LightGBM classifier and saves model + SHAP explainer as joblib files.
"""
import os
from dotenv import load_dotenv
load_dotenv()
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from urllib.parse import quote_plus
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
import lightgbm as lgb
import joblib

DB_HOST = os.getenv('DATABASE_HOST', 'localhost')
DB_PORT = os.getenv('DATABASE_PORT', '5432')
DB_USER = os.getenv('DATABASE_USER', 'postgres')
DB_PASS = os.getenv('DATABASE_PASSWORD', '@malachi4')
DB_NAME = os.getenv('DATABASE_NAME', 'finance_dev')

DB_USER_Q = quote_plus(DB_USER or '')
DB_PASS_Q = quote_plus(DB_PASS or '')
CONN = f"postgresql://{DB_USER_Q}:{DB_PASS_Q}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

MODEL_DIR = os.getenv('MODEL_DIR', './models')
os.makedirs(MODEL_DIR, exist_ok=True)

try:
    engine = create_engine(CONN)
except Exception as e:
    print('Failed to create DB engine. Check DATABASE_* env vars. Connection string:', CONN)
    raise

# Simple feature builder from available tables.
# This is intentionally conservative and explainable.

def load_data():
    # Read full tables and detect actual column names (handle case/underscore variations)
    loans = pd.read_sql('SELECT * FROM loan', engine)
    payments = pd.read_sql('SELECT * FROM payment', engine)
    users = pd.read_sql('SELECT * FROM "user"', engine)

    def find_col(df, candidates):
        cols = [c.lower() for c in df.columns]
        for cand in candidates:
            if cand.lower() in cols:
                # return actual column name with original casing
                return df.columns[cols.index(cand.lower())]
        return None

    loan_id_col = find_col(loans, ['id'])
    loan_client_col = find_col(loans, ['clientid', 'client_id', 'client'])
    loan_amount_col = find_col(loans, ['amount'])
    loan_balance_col = find_col(loans, ['balance'])
    loan_status_col = find_col(loans, ['status'])
    loan_created_col = find_col(loans, ['createdat', 'created_at', 'created'])

    pay_loan_col = find_col(payments, ['loanid', 'loan_id', 'loan'])
    pay_amount_col = find_col(payments, ['amount'])
    pay_created_col = find_col(payments, ['createdat', 'created_at', 'created'])

    user_id_col = find_col(users, ['id'])
    user_branch_col = find_col(users, ['branch'])
    user_created_col = find_col(users, ['createdat', 'created_at', 'created'])

    if loan_id_col is None or loan_amount_col is None or loan_balance_col is None:
        raise RuntimeError('Required loan columns not found in DB: found ' + ','.join(list(loans.columns)))

    # Aggregate payments per loan
    if pay_loan_col is not None and pay_amount_col is not None:
        payments_ren = payments.rename(columns={pay_loan_col: 'loan_ref', pay_amount_col: 'amount_paid'})
        pay_agg = payments_ren.groupby('loan_ref').amount_paid.agg(['sum','count']).rename(columns={'sum':'paid_total','count':'num_payments'})
        # normalize key types
        loans_key = loans.rename(columns={loan_id_col: 'loan_ref'}).copy()
        loans = loans_key.merge(pay_agg, how='left', left_on='loan_ref', right_on='loan_ref')
        loans['paid_total'] = loans['paid_total'].fillna(0)
        loans['num_payments'] = loans['num_payments'].fillna(0)
    else:
        loans['paid_total'] = 0
        loans['num_payments'] = 0

    # Create features
    loans['amount_val'] = loans[loan_amount_col]
    loans['balance_val'] = loans[loan_balance_col]
    loans['paid_fraction'] = loans['paid_total'] / (loans['amount_val'] + 1e-9)

    if loan_created_col:
        loans['age_days'] = (pd.to_datetime('now') - pd.to_datetime(loans[loan_created_col])).dt.days
    else:
        loans['age_days'] = 0

    # Label: default if status != 'active' and balance > 0
    if loan_status_col:
        loans['is_default'] = ((loans[loan_status_col] != 'active') & (loans['balance_val'] > 0)).astype(int)
    else:
        loans['is_default'] = (loans['balance_val'] > 0).astype(int)

    # Join user-level features (proxy) if possible
    client_map_col = loan_client_col or user_id_col
    if client_map_col and user_id_col:
        # rename columns to join
        loans = loans.rename(columns={loan_client_col: 'client_ref'}) if loan_client_col else loans
        users_ren = users.rename(columns={user_id_col: 'client_ref'})
        users_subset = users_ren[['client_ref', user_branch_col or user_created_col]].rename(columns={user_branch_col or user_created_col: 'user_info'})
        # best-effort client tenure
        if user_created_col:
            # rename then convert to avoid duplicate column names
            users_ren = users.rename(columns={user_id_col: 'client_ref', user_created_col: 'user_created'})
            users_ren['user_created'] = pd.to_datetime(users_ren['user_created'], errors='coerce')
            loans = loans.merge(users_ren[['client_ref','user_created']], how='left', left_on='client_ref', right_on='client_ref')
            loans['client_tenure_days'] = (pd.to_datetime('now') - loans['user_created']).dt.days.fillna(0)
        else:
            loans['client_tenure_days'] = 0
    else:
        loans['client_tenure_days'] = 0

    # Keep features and label (robust to renamed columns)
    # Determine id column
    if 'loan_ref' in loans.columns:
        id_col = 'loan_ref'
    elif loan_id_col and loan_id_col in loans.columns:
        id_col = loan_id_col
    else:
        id_col = None

    # Determine client column
    if 'client_ref' in loans.columns:
        client_col = 'client_ref'
    elif loan_client_col and loan_client_col in loans.columns:
        client_col = loan_client_col
    else:
        client_col = None

    cols = {}
    if id_col:
        cols['id'] = loans[id_col]
    else:
        cols['id'] = pd.RangeIndex(start=0, stop=len(loans))

    if client_col:
        cols['clientid'] = loans[client_col]
    else:
        cols['clientid'] = [None] * len(loans)

    cols['amount'] = loans.get('amount_val', loans.get(loan_amount_col, 0))
    cols['balance'] = loans.get('balance_val', loans.get(loan_balance_col, 0))
    cols['paid_total'] = loans.get('paid_total', 0)
    cols['num_payments'] = loans.get('num_payments', 0)
    cols['paid_fraction'] = loans.get('paid_fraction', 0)
    cols['age_days'] = loans.get('age_days', 0)
    cols['client_tenure_days'] = loans.get('client_tenure_days', 0)
    cols['is_default'] = loans.get('is_default', 0)

    features = pd.DataFrame(cols)
    features = features.fillna(0)
    return features


def generate_synthetic(n=1000, seed=42):
    """Generate a synthetic dataset resembling loan/payment features for demo purposes.
    Not meant for production use — only for bootstrapping the demo model.
    """
    np.random.seed(seed)
    amounts = np.random.choice([100,200,500,1000,2000,5000], size=n, p=[0.1,0.15,0.2,0.3,0.15,0.1])
    paid_fraction = np.clip(np.random.beta(2,5, size=n), 0, 1)
    num_payments = (paid_fraction * 12).astype(int)
    balance = amounts * (1 - paid_fraction)
    age_days = np.random.randint(1, 365, size=n)
    client_tenure_days = np.random.randint(0, 2000, size=n)

    # Simple label: more likely to default if low paid_fraction, high balance, short tenure
    score_raw = (1 - paid_fraction) * 0.6 + (balance / (amounts + 1e-9)) * 0.3 + (age_days < 30) * 0.1
    prob_default = np.clip(score_raw + np.random.normal(0, 0.05, size=n), 0, 1)
    is_default = (prob_default > 0.5).astype(int)

    df = pd.DataFrame({
        'id': [f'synth-{i}' for i in range(n)],
        'clientid': [f'client-{i%100}' for i in range(n)],
        'amount': amounts,
        'balance': balance,
        'paid_total': amounts * paid_fraction,
        'num_payments': num_payments,
        'paid_fraction': paid_fraction,
        'age_days': age_days,
        'client_tenure_days': client_tenure_days,
        'is_default': is_default,
    })
    return df


def train():
    df = load_data()
    if df.shape[0] < 50:
        print('Not enough data to train a reliable model. Need >=50 rows, found', df.shape[0])
        print('Generating synthetic dataset for demo training (not for production)')
        df = generate_synthetic(1000)
    X = df[['amount','balance','paid_total','num_payments','paid_fraction','age_days','client_tenure_days']]
    y = df['is_default']
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    params = {
        'objective':'binary',
        'boosting_type':'gbdt',
        'verbosity':-1,
        'seed':42,
        'n_estimators': 500
    }
    model = lgb.LGBMClassifier(**params)
    # Use a simple fit call for maximum compatibility across lightgbm versions
    model.fit(X_train, y_train)

    # get probability predictions for AUC
    if hasattr(model, 'predict_proba'):
        preds = model.predict_proba(X_test)[:, 1]
    else:
        preds = model.predict(X_test)
    auc = roc_auc_score(y_test, preds)
    print('Test AUC:', auc)

    # Save model and feature names
    joblib.dump({'model': model, 'features': X.columns.tolist()}, os.path.join(MODEL_DIR, 'credit_model.joblib'))

    # Save a simple shap explainer (TreeExplainer)
    try:
        import shap
        expl = shap.TreeExplainer(model)
        joblib.dump({'explainer': expl}, os.path.join(MODEL_DIR, 'credit_explainer.joblib'))
    except Exception as e:
        print('SHAP explainer could not be saved:', e)

    # Save training metrics
    joblib.dump({'auc': auc}, os.path.join(MODEL_DIR, 'metrics.joblib'))
    print('Model artifact saved to', MODEL_DIR)

if __name__ == '__main__':
    train()

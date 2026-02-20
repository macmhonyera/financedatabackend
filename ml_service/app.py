"""FastAPI model scoring service.
Endpoints:
- POST /score -> score single application
- POST /score/batch -> score batch of applications

Environment variables:
- MODEL_DIR: where model joblib files live
- PORT
- DATABASE_* (optional for direct feature lookups)
"""
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import numpy as np
import pandas as pd

MODEL_DIR = os.getenv('MODEL_DIR', './models')
MODEL_PATH = os.path.join(MODEL_DIR, 'credit_model.joblib')
EXPL_PATH = os.path.join(MODEL_DIR, 'credit_explainer.joblib')

app = FastAPI(title='Credit Scoring Service')

class ScoreRequest(BaseModel):
    amount: float
    balance: float
    paid_total: float = 0.0
    num_payments: int = 0
    age_days: int = 0
    client_tenure_days: int = 0

class ScoreResponse(BaseModel):
    score: float
    prob_default: float
    decision: str
    explanations: dict = None

# load model
if not os.path.exists(MODEL_PATH):
    print('Warning: model artifact not found at', MODEL_PATH)
    MODEL = None
else:
    d = joblib.load(MODEL_PATH)
    MODEL = d['model']
    FEATURES = d.get('features')
    print('Loaded model with features:', FEATURES)

EXPLAINER = None
if os.path.exists(EXPL_PATH):
    try:
        EXPLAINER = joblib.load(EXPL_PATH).get('explainer')
        print('Loaded explainer')
    except Exception as e:
        print('Could not load explainer:', e)


def compute_score_from_features(df_row):
    global MODEL, FEATURES
    if MODEL is None:
        raise RuntimeError('Model not loaded')
    X = np.array([df_row.get(f, 0.0) for f in FEATURES]).reshape(1, -1)
    # Prefer predict_proba when available
    if hasattr(MODEL, 'predict_proba'):
        prob = float(MODEL.predict_proba(X)[:, 1][0])
    else:
        # fallback to predict (may be label); convert label to prob-like (0 or 1)
        prob = float(MODEL.predict(X)[0])
    # Map prob to score 0-100 (higher = better)
    score = max(0.0, min(100.0, (1 - prob) * 100))
    explanations = None
    if EXPLAINER is not None:
        try:
            import shap
            vals = EXPLAINER.shap_values(pd.DataFrame(X, columns=FEATURES))[0]
            contribs = {FEATURES[i]: float(vals[i]) for i in range(len(FEATURES))}
            # sort and pick top contributors
            top = dict(sorted(contribs.items(), key=lambda kv: abs(kv[1]), reverse=True)[:5])
            explanations = top
        except Exception as e:
            explanations = {'error': str(e)}
    return {'score': score, 'prob_default': prob, 'decision': ('decline' if prob>0.6 else 'review' if prob>0.3 else 'accept'), 'explanations': explanations}

@app.post('/score', response_model=ScoreResponse)
def score(req: ScoreRequest):
    try:
        row = req.dict()
        res = compute_score_from_features(row)
        return res
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post('/score/batch')
def score_batch(rows: list[ScoreRequest]):
    out = []
    for r in rows:
        res = compute_score_from_features(r.dict())
        out.append(res)
    return out

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('app:app', host='0.0.0.0', port=int(os.getenv('PORT', 8000)), reload=False)

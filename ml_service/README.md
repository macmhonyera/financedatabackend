Credit Scoring ML Service

Quickstart

1. Create a virtualenv and install:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Configure DB and model dir in `.env` (see `.env.example`)

3. Train model:

```bash
python train.py
```

4. Run the scoring API:

```bash
MODEL_DIR=./models PORT=8000 uvicorn app:app --host 0.0.0.0 --port 8000
```

Endpoints
- POST /score - single scoring
- POST /score/batch - batch scoring

Model artifacts saved in `MODEL_DIR` as joblib files.

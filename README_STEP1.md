# PrintShop Automation — Step 1

## What works
- FastAPI backend
- React/Vite frontend
- CORS connection
- `/api/health` test endpoint

## Run backend on Windows PowerShell

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend:
http://localhost:8000

API docs:
http://localhost:8000/docs

## Run frontend

Open a second VS Code terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, normally:
http://localhost:5173

The page should display:
Backend: ok

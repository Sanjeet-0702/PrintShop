with open('backend/app/main.py', 'r', encoding='utf-8') as f:
    code = f.read()

target1 = '''shop_admin.configure(
    secret_key=settings.secret_key,
    frontend_url=settings.frontend_url,
)'''

replacement1 = '''shop_admin.configure(
    secret_key=settings.secret_key,
    frontend_url=settings.frontend_url,
    sumatra_path=settings.sumatra_path,
)'''

target2 = '''app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)'''

replacement2 = '''app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        settings.frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)'''

if target1 in code:
    code = code.replace(target1, replacement1, 1)
    print("Updated shop_admin.configure in main.py")

if target2 in code:
    code = code.replace(target2, replacement2, 1)
    print("Updated CORS in main.py")

with open('backend/app/main.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("main.py updated successfully!")


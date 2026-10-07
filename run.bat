@echo off

choice /c YN /n /m "mea-proto install/run start? (Y/N): "
if errorlevel 2 (
    echo mea-proto install/run canceled.
    pause
    exit /b 1
) else (
    echo mea-proto install/run trying...
    pip install -r requirements.txt

    if errorlevel 1 (
        echo [ERROR] mea-proto install/run failed.
        pause
        exit /b 1
    )
)

echo ==========================================
echo Python module check...
echo ==========================================

set "MISSING="

call :CHECK_MODULE flask Flask
call :CHECK_MODULE flask_cors Flask-Cors
call :CHECK_MODULE google.generativeai google-generativeai
call :CHECK_MODULE werkzeug Werkzeug

if not defined MISSING (
    echo ==========================================
    echo all required packages are installed.
    echo ==========================================
    echo.
    pause
    goto runmain
) else (
    echo ==========================================
    echo missing required packages: %MISSING%
    echo ==========================================
    echo.
    pause
    exit /b 1
)

:runmain
echo ==========================================
echo run mea-proto
echo ==========================================
echo.



python app.py
pause
exit /b 0

:CHECK_MODULE
set "IMPORT_NAME=%~1"
set "PIP_NAME=%~2"
echo Checking Python module: %IMPORT_NAME%...

python -c "import %IMPORT_NAME%" >nul 2>&1

if errorlevel 1 (
    echo [MISSING] %PIP_NAME%
    if not defined MISSING (
        set "MISSING=%PIP_NAME%"
    ) else (
        set "MISSING=%MISSING% %PIP_NAME%"
    )
) else (
    echo [OK] %PIP_NAME%
)
pause
exit /b 0
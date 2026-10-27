@echo off

:choiceir
echo mea-proto install/run script
echo.
echo 1. run mea-proto
echo 2. install mea-proto
echo 0. exit
choice /c 120 /n /m "choose an option (1/2/0): "

if %errorlevel%==1 (
    echo ==========================================
    echo run mea-proto
    echo ==========================================
    echo.
    pause
    cls
    goto runmain

) else if %errorlevel%==2 (
    echo ==========================================
    echo mea-proto install
    echo ==========================================
    echo.
    pause
    cls
    goto install
) else (
    exit /b 0
)





:install

echo mea-proto install trying...
pip install -r requirements.txt

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
    cls
    goto choiceir
) else (
    echo ==========================================
    echo missing required packages: %MISSING%
    echo ==========================================
    echo.
    choice /c yn /n /m "try to reinstall missing packages? (Y/N): "
    if errorlevel 2 (
        echo reinstall canceled.
        pause
        cls
        goto choiceir
    )
    pip install %MISSING%
    if errorlevel 1 (
        echo failed to install missing packages: %MISSING%
        pause
        cls
        goto choiceir
    )
    cls
    goto choiceir
)



:runmain

echo ==========================================
echo run mea-proto
echo ==========================================
echo.

python app.py

pause
goto choiceir



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
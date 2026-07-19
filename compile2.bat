@echo off
"C:\msys64\ucrt64\bin\g++.exe" -v -x c++ -E - < NUL 2>&1 | more
echo EXIT: %ERRORLEVEL%

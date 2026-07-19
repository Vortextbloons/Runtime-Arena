@echo off
"C:\msys64\ucrt64\bin\g++.exe" -O3 -std=c++23 -I "C:\Users\isaac\Desktop\DevProjects\Misc\Runtime Arena\languages\cpp\include" -o "C:\Users\isaac\Desktop\DevProjects\Misc\Runtime Arena\test.exe" "C:\Users\isaac\Desktop\DevProjects\Misc\Runtime Arena\benchmarks\matrix-multiplication\implementations\cpp\main.cpp" -lpthread
echo EXIT: %ERRORLEVEL%

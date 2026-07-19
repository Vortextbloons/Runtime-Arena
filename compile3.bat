@echo off
echo #include ^<iostream^>> "C:\Users\isaac\Desktop\DevProjects\Misc\Runtime Arena\simple.cpp"
echo int main() { std::cout << "hello" << std::endl; return 0; }>> "C:\Users\isaac\Desktop\DevProjects\Misc\Runtime Arena\simple.cpp"
"C:\msys64\ucrt64\bin\g++.exe" -o "C:\Users\isaac\Desktop\DevProjects\Misc\Runtime Arena\simple.exe" "C:\Users\isaac\Desktop\DevProjects\Misc\Runtime Arena\simple.cpp" 2>&1
echo EXIT: %ERRORLEVEL%

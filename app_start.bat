@echo off
Set APP_PATH=D:\PRG\NodeJS\nlsw\

@echo start mongod db
start %COMSPEC% /k mongod --dbpath %APP_PATH%\data\db 

@echo start application
@start %COMSPEC% /k gulp


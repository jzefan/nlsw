@echo off
Set APP_PATH=D:\NLSW

@echo repair
start %COMSPEC% /k mongod --dbpath %APP_PATH%\data\db --repair 

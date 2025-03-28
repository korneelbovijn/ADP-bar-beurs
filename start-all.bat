@echo off
start cmd /k "cd bar-management && npm start"
start cmd /k "cd bar-admin && npm start -- --host"
start cmd /k "cd bar-app && npm start -- --host"
start cmd /k "cd bar-visual && npm start -- --host"

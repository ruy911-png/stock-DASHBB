@echo off
chcp 65001 >nul
cd /d C:\Users\82109\Desktop\stock-DASHBB
echo ===== 삼성전기·LG이노텍·신세계·이마트 일괄 분석 시작 =====
claude -p "삼성전기, LG이노텍, 신세계, 이마트 각각 분석해줘"
echo ===== 전체 완료 =====
dir analyses_*.json
echo DONE_ALL_ANALYSES
pause

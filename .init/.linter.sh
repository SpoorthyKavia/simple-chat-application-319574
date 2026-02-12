#!/bin/bash
cd /home/kavia/workspace/code-generation/simple-chat-application-319574/chat_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi


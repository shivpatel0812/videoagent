#!/bin/bash

echo "Setting up Video Analysis Agent..."

cp ai-agent/.env.example ai-agent/.env

echo "Environment file created. Please edit ai-agent/.env and add your Anthropic API key."
echo ""
echo "To get your Anthropic API key:"
echo "1. Go to https://console.anthropic.com/"
echo "2. Sign up/login to your account"
echo "3. Navigate to API Keys section"
echo "4. Create a new API key"
echo "5. Copy it to the .env file"
echo ""
echo "After adding your API key, run:"
echo "cd ai-agent && npm start"
# NUDM Intern Assessment 2025

## Property Tax Analytics Dashboard

This project is a Property Tax Analytics Dashboard built for the UPYOG multi-tenant platform using React and Vite.

## Features

- KPI Dashboard
- Tenant-based filtering
- Comparison charts
- AI Chat Assistant using Gemini API
- Responsive UI

## Tech Stack

- React
- Vite
- Recharts
- Gemini API

## Setup Instructions

1. Clone the repository

git clone https://github.com/prachurjyaa/nudm-assesment_biswa.git

2. Navigate to the project folder

cd nudm-assesment_biswa

3. Install dependencies

npm install

4. Create a .env file

VITE_GEMINI_API_KEY=your_api_key_here

5. Start the development server

npm run dev

## Project Structure

project-root/
│
├── dist/
├── node_modules/
├── public/
│
├── src/
│   ├── assets/
│   ├── services/
│   │   └── geminiService.js
│   │
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   ├── main.jsx
│   └── properties.json
│
├── .env
├── .env.example
├── .gitignore
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── README.md
└── vite.config.js

## Notes

- properties.json contains 1000 property records
- API keys are stored securely in .env

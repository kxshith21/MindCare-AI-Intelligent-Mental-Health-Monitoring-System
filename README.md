# 🧠 MindCare AI — Intelligent Mental Health Monitoring System

<div align="center">

![Python](https://img.shields.io/badge/Python-3.10-blue?style=for-the-badge&logo=python)
![Flask](https://img.shields.io/badge/Flask-Web_App-black?style=for-the-badge&logo=flask)
![Transformers](https://img.shields.io/badge/HuggingFace-Transformers-yellow?style=for-the-badge)
![SQLite](https://img.shields.io/badge/SQLite-Database-blue?style=for-the-badge&logo=sqlite)
![ChartJS](https://img.shields.io/badge/Chart.js-Analytics-red?style=for-the-badge&logo=chartdotjs)

### AI-Powered Mental Wellness Assistant with Emotion Analysis, Risk Detection & Dashboard Analytics

</div>

---

# 📌 Overview

MindCare AI is an intelligent mental health assistant designed to monitor emotional well-being using Natural Language Processing (NLP) and Transformer-based AI models.

The system analyzes user conversations in real time, detects emotional states, identifies high-risk mental distress patterns, and provides calm supportive responses while maintaining analytical dashboards for emotional trend tracking.

This project combines:

- 🧠 Transformer NLP
- 💬 AI Chatbot Interaction
- 📊 Dashboard Analytics
- 🚨 Crisis Risk Detection
- 🗄️ Conversation History Tracking
- 🌐 Full Stack Web Development

---

# ✨ Features

## 🤖 AI Mental Health Chatbot
- Emotion-aware conversational assistant
- Calm and supportive responses
- Real-time message processing
- Modern responsive chatbot UI

## 🧠 Emotion Detection
Uses pretrained Hugging Face transformer model:

`j-hartmann/emotion-english-distilroberta-base`

Detects:
- Sadness
- Joy
- Fear
- Anger
- Neutral emotions

## 🚨 Suicide Risk Detection
- High-risk phrase analysis
- Emotional distress scoring
- Emergency alert triggering
- Crisis monitoring system

## 📊 Analytics Dashboard
- Weekly emotion trends
- Mood improvement analysis
- Risk timeline tracking
- Emotion distribution graphs
- Mental wellness score

## 🗄️ Conversation Storage
- SQLite database integration
- Chat history management
- Emotional timeline records

---

# 🏗️ System Architecture

```text
User Message
      ↓
Flask Backend API
      ↓
Transformer Emotion Model
      ↓
Risk Analyzer Engine
      ↓
Supportive Response Generator
      ↓
Database Storage
      ↓
Dashboard Analytics
      ↓
Emergency Alert System

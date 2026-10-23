# 🎵 MusicHub

**MusicHub** — это мощный десктопный музыкальный плеер-агрегатор, который объединяет несколько стриминговых сервисов в одном окне, дополненный умными визуализациями, AI-ассистентом и полной кастомизацией интерфейса. Это мой инженерный проект, созданный для изучения и применения современных технологий.

[![Electron](https://img.shields.io/badge/Electron-34.2.0-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

![MusicHub Preview](screenshot/main.png)

<div align="center">
  <br/>
  <a href="https://download.mawba-1230.workers.dev/">
    <img src="https://img.shields.io/badge/Скачать_для_Windows-1DB954?style=flat&logo=windows11&logoColor=white&labelColor=0a0a0a" alt="Скачать MusicHub" height="45">
  </a>
  &nbsp;&nbsp;
  <a href="https://mamba1230.github.io/">
    <img src="https://img.shields.io/badge/Официальный_сайт-333333?style=flat&logo=googlechrome&logoColor=white&labelColor=0a0a0a" alt="Сайт MusicHub" height="45">
  </a>
  <br/>
  <br/>
</div>

---

## 🚀 Ключевые возможности

*   **Мультисервисность:** Поддерживает Яндекс Музыку, YouTube Music, SoundCloud, Apple Music, VK Music и любые кастомные URL.
*   **Умные визуализации:** Более 10 режимов (полосы, волна, круг, частицы, GIF, 3D-режимы), реагирующих на звук в реальном времени.
*   **Гибкое управление:**
    *   Горячие клавиши с полной перенастройкой.
    *   **Мобильный пульт** (интерфейс по QR-коду) с синхронизацией статуса через WebSocket.
    *   Управление плеером через AI-ассистента.
*   **AI-ассистент нового поколения:**
    *   Интеграция с GigaChat.
    *   Управление плеером через текстовые команды (`найди песню`, `включи/выключи`, `следующий трек`).
    *   Контекстный диалог и работа с базой знаний.
*   **Кастомизация:** Тёмная/светлая темы, выбор акцентного цвета, настройка поведения окна (стиль кнопок macOS/Windows, масштаб 80-120%), система плагинов.
*   **Продвинутый звук (C# модуль):**
    *   Захват аудиосистемы напрямую через WASAPI (без Virtual Audio Cable).
    *   Передача аудиопотока через WebSocket.
    *   Умное управление громкостью и определение Play/Pause.

---

## 🛠️ Технологический стек

| Технология | Применение |
| :--- | :--- |
| **Electron** | Десктопный фреймворк |
| **HTML / CSS / JS** | Интерфейс и логика |
| **Web Audio API** | Анализ звука, визуализации |
| **WebSocket** | Чат, мобильное управление, аудиопоток |
| **C# / NAudio / WASAPI** | Захват звука, системное управление громкостью |
| **Cloudflare Workers** | Бэкенд, WebSocket-сервер |

---

## 🖥️ Установка и запуск

Проект легко развернуть на любой Windows-машине.

```bash
# Клонируем репозиторий
git clone https://github.com/Mamba1230/musichub.git
cd musichub

# Устанавливаем зависимости
npm install

# Запускаем
npm start

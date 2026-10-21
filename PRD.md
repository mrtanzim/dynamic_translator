# VocabFlow — Product Requirements Document

## Overview
VocabFlow is a floating vocabulary companion for Bengali-native English learners, optimized for watching English-subtitled anime (e.g. HiAnime) without leaving the video player.

## Goals
- Floating, draggable, resizable overlay toggled by toolbar icon.
- Bilingual lookup (English↔Bengali) with offline dictionary first.
- Concurrent AI lookups (Groq, OpenRouter, Gemini) that improve provisional offline results.
- Vocabulary history, saved words, pronunciation, provider settings, optional Supabase auth.

## Core principle
The overlay stays useful even when subtitle detection, auth, internet, and all AI providers are unavailable.

## Users
Bengali-native English learners watching subtitled video.

## Functional requirements
See master build prompt sections 4–11.

## Non-functional
MV3, strict TS, React, Vite, Tailwind, IndexedDB, HTTPS-only, least privilege.

## Out of scope (initial)
Full sentence translation offline; native audio datasets; subtitle auto-extraction (manual context only).

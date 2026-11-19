import type React from 'react'

/**
 * Premium dark glassmorphism stylesheet for the VocabFlow overlay.
 * Refined corner curves (10px panel, 8px cards) for a sleek, modern finish.
 * Includes discrete enhanced result badges, toast notifications, and breadcrumb navigation.
 */
export const OVERLAY_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');

:host {
  color-scheme: dark;
}

* {
  scrollbar-width: thin;
  scrollbar-color: rgba(56, 189, 248, 0.4) transparent;
  box-sizing: border-box;
}

*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background: rgba(56, 189, 248, 0.65);
}

*::-webkit-scrollbar-corner {
  background: transparent;
}

*::-webkit-scrollbar-button {
  display: none;
}

* {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  letter-spacing: -0.01em;
}

.bn {
  font-family: 'Noto Sans Bengali', 'Noto Sans Bengali UI', 'Noto Serif Bengali', 'Arial', 'Tahoma', sans-serif;
  font-feature-settings: 'liga';
}

/* Main floating glassmorphism panel — tightened corner curve (10px) */
.panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 360px;
  height: 720px;
  min-width: 300px;
  min-height: 520px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  background: rgba(30, 41, 54, 0.82);
  backdrop-filter: blur(14px) saturate(115%);
  -webkit-backdrop-filter: blur(14px) saturate(115%);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  color: #e8edf2;
  display: flex;
  flex-direction: column;
  z-index: 2147483647;
  overflow: hidden;
  touch-action: none;
  transition: height 0.2s ease;
}

.panel.minimized {
  height: 48px !important;
  min-height: 48px !important;
}

/* Header bar */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  flex: 0 0 auto;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.header:active {
  cursor: grabbing;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #ffffff;
  padding: 3px 6px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.brand:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #38bdf8;
}

.brand-icon {
  display: flex;
  align-items: center;
  color: #38bdf8;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-icon-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.header-icon-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.menu-trigger-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #94a3b8;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.menu-trigger-btn:hover,
.menu-trigger-btn.active {
  color: #ffffff;
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.4);
}

/* Dropdown Menu */
.menu-panel {
  position: absolute;
  top: 48px;
  right: 12px;
  width: 236px;
  background: rgba(13, 20, 32, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65);
  padding: 6px;
  z-index: 2147483648;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: menuAppear 0.12s ease-out;
}

@keyframes menuAppear {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
  width: 100%;
}

.menu-item:hover {
  background: rgba(56, 189, 248, 0.10);
}

.menu-item.active {
  background: rgba(56, 189, 248, 0.15);
}

.menu-item-icon {
  color: #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-item-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.menu-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.menu-item.active .menu-item-title {
  color: #38bdf8;
}

.menu-item-subtitle {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 1px;
}

.menu-item-tag {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.18);
  color: #38bdf8;
  margin-left: 6px;
}

/* Language picker */
.lang-select {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lang-select-label {
  font-size: 12px;
  font-weight: 600;
  color: #38bdf8;
}

.lang-select-trigger {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(10, 14, 21, 0.55);
  color: #e8edf2;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.lang-select-trigger:hover {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(16, 24, 38, 0.8);
}

.lang-select-trigger:focus-visible {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.22);
}

.lang-select-chevron {
  display: flex;
  color: #38bdf8;
  transition: transform 0.15s ease;
}

.lang-select-trigger[aria-expanded='true'] .lang-select-chevron {
  transform: rotate(180deg);
}

.lang-select-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 220px;
  overflow-y: auto;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: rgba(13, 20, 32, 0.98);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6);
  animation: menuAppear 0.12s ease-out;
}

.lang-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 6px;
  color: #e8edf2;
  font-size: 13px;
  cursor: pointer;
}

.lang-select-option:hover,
.lang-select-option.highlight {
  background: rgba(56, 189, 248, 0.14);
  color: #f8fbff;
}

.lang-select-option[aria-selected='true'] {
  color: #38bdf8;
  font-weight: 700;
  background: rgba(56, 189, 248, 0.1);
}

.lang-select-option[aria-selected='true']::after {
  content: '✓';
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .lang-select-trigger,
  .lang-select-chevron,
  .lang-select-menu {
    transition: none;
    animation: none;
  }
}

/* Toast notification */
.toast-notification {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  color: #f1f5f9;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: toastFade 0.2s ease-out;
}

@keyframes toastFade {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.toast-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.toast-close:hover {
  color: #ffffff;
}

/* Scrollable Content */
.content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

/* Back button for secondary views */
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  width: fit-content;
  transition: all 0.15s ease;
  margin-bottom: 4px;
}

.back-btn:hover {
  color: #ffffff;
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.4);
}

/* Search input */
.search-wrap {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
}

.search-input {
  width: 100%;
  height: 42px;
  padding: 0 38px 0 42px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(16, 21, 29, 0.65);
  color: #f8fafc;
  font-size: 14px;
  font-weight: 400;
  outline: none;
  transition: all 0.15s ease;
}

.search-input::placeholder {
  color: rgba(148, 163, 184, 0.65);
}

.search-input:focus {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
  background: rgba(16, 21, 29, 0.85);
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  color: #94a3b8;
  pointer-events: none;
}

.clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
}

.clear-btn:hover {
  background: rgba(148, 163, 184, 0.35);
  color: #ffffff;
}

/* Suggestions Dropdown */
.suggestion-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: rgba(13, 20, 32, 0.96);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
  max-height: 220px;
  overflow-y: auto;
  z-index: 2147483648;
  padding: 4px;
}

.suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  color: #f8fafc;
  cursor: pointer;
  border: none;
  background: transparent;
  text-align: left;
  border-radius: 6px;
  width: 100%;
  transition: background 0.1s ease;
}

.suggestion:hover,
.suggestion.highlighted {
  background: rgba(56, 189, 248, 0.12);
}

.suggestion-word {
  font-weight: 600;
  color: #f1f5f9;
}

.suggestion-hint {
  font-size: 12px;
  color: #94a3b8;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Empty / Loading / Error */
.empty {
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
  padding: 28px 0;
}

.loading {
  color: #38bdf8;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

.error {
  color: #f87171;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

/* Word Result Section */
.result-section {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}

.hero-word {
  font-size: 32px;
  font-weight: 700;
  color: #38bdf8;
  letter-spacing: -0.02em;
  line-height: 1.15;
  word-break: break-word;
  overflow-wrap: break-word;
}

.hero-word.sentence {
  font-size: 19px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: normal;
}

.meaning-bn {
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.35;
  margin-top: 4px;
  word-break: break-word;
  overflow-wrap: break-word;
}

.meaning-bn.sentence {
  font-size: 16.5px;
  font-weight: 500;
  line-height: 1.45;
  color: #f1f5f9;
}

.meaning-en {
  font-size: 23px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.35;
  margin-top: 4px;
  word-break: break-word;
  overflow-wrap: break-word;
}

.meaning-en.sentence {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.45;
  color: #f1f5f9;
}

.pronounce-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.pronounce-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 9999px;
  background: rgba(16, 24, 38, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #f1f5f9;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pronounce-pill:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.45);
}

.pill-icon {
  color: #38bdf8;
  display: flex;
  align-items: center;
}

.pronounce-ipa {
  font-size: 13px;
  color: #cbd5e1;
  font-weight: 500;
}

.pos-tag {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 5px;
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}

.band-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 5px;
  background: rgba(56, 189, 248, 0.14);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.32);
}

.transcription-tag {
  font-size: 12px;
  color: #fcd34d;
  font-weight: 500;
}

.definition-text {
  font-size: 14.5px;
  color: #e2e8f0;
  line-height: 1.45;
  margin-bottom: 10px;
}

/* Subtle result source indicator (no raw "groq" or "AI" text shown) */
.enhanced-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #38bdf8;
  width: fit-content;
}

.enhanced-badge.offline {
  color: #7fd1a6;
}

.badge-sparkle {
  font-size: 12px;
  color: #38bdf8;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7fd1a6;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Synonyms & Antonyms (2-Column Grid) */
.pairs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-bottom: 10px;
}

.pair-card {
  background: rgba(16, 24, 38, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pair-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #38bdf8;
}

.pair-body {
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.4;
  word-break: break-word;
}

/* Example Card */
.example-card {
  background: rgba(16, 24, 38, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 10px 13px;
  margin-bottom: 10px;
}

.example-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #38bdf8;
  margin-bottom: 5px;
}

.example-en {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.4;
}

.example-en .highlight {
  color: #38bdf8;
}

.example-bn {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 4px;
  line-height: 1.4;
}

/* Collocations Card */
.collocations-card {
  background: rgba(16, 24, 38, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.collocations-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #38bdf8;
  margin-bottom: 6px;
}

.collocations-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.collocation-pill {
  font-size: 11.5px;
  padding: 4px 9px;
  border-radius: 6px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
  font-weight: 500;
  line-height: 1.35;
}

/* Word Family Card */
.word-family-card {
  background: rgba(16, 24, 38, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.word-family-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #38bdf8;
  margin-bottom: 6px;
}

.word-family-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
  gap: 5px 12px;
}

.family-item {
  font-size: 11.5px;
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.family-label {
  color: #94a3b8;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
}

.family-val {
  color: #f1f5f9;
  font-weight: 500;
}

/* Common Mistake Card */
.mistake-card {
  background: rgba(16, 24, 38, 0.55);
  border: 1px solid rgba(251, 191, 36, 0.28);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.mistake-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fcd34d;
  margin-bottom: 4px;
}

.mistake-body {
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.4;
}

/* Action Cards (Listen & Save word side-by-side) */
.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: auto;
  padding-top: 10px;
  margin-bottom: 2px;
}

.action-card-btn {
  height: 46px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(16, 24, 38, 0.65);
  color: #f1f5f9;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  outline: none;
  transition: all 0.15s ease;
  padding: 0 14px;
}

.action-card-btn:hover {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.12);
}

.action-card-btn.saved {
  border-color: rgba(243, 201, 105, 0.45);
  background: rgba(243, 201, 105, 0.08);
  color: #f3c969;
}

.action-card-btn .card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-card-btn .card-label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

/* Density Modes: Comfortable (Spacious/Expanded) vs Compact (Single Screen) */
.result-section.density-comfortable {
  gap: 2px;
}

.result-section.density-comfortable .pair-card {
  padding: 12px 14px;
}

.result-section.density-comfortable .collocations-card {
  padding: 12px 14px;
  margin-bottom: 12px;
}

.result-section.density-comfortable .collocation-pill {
  padding: 5px 10px;
  font-size: 12px;
}

.result-section.density-comfortable .example-card {
  padding: 12px 14px;
  margin-bottom: 12px;
}

.result-section.density-comfortable .example-en {
  font-size: 14.5px;
  line-height: 1.45;
}

.result-section.density-comfortable .example-bn {
  font-size: 13.5px;
  line-height: 1.45;
  margin-top: 5px;
}

.result-section.density-comfortable .word-family-card {
  padding: 12px 14px;
  margin-bottom: 12px;
}

.result-section.density-comfortable .word-family-grid {
  gap: 6px 14px;
}

.result-section.density-comfortable .family-item {
  font-size: 12px;
}

.result-section.density-comfortable .mistake-card {
  padding: 12px 14px;
  margin-bottom: 14px;
}

.result-section.density-comfortable .mistake-body {
  font-size: 12.5px;
  line-height: 1.5;
}

.result-section.density-comfortable .actions-grid {
  padding-top: 14px;
  margin-top: auto;
}

.result-section.density-comfortable .action-card-btn {
  height: 48px;
  border-radius: 9px;
}

/* Compact Mode (Tightly fits onto single view) */
.result-section.density-compact .hero-word:not(.sentence) {
  font-size: 26px;
  line-height: 1.1;
}

.result-section.density-compact .meaning-bn:not(.sentence) {
  font-size: 17px;
  margin-top: 2px;
  line-height: 1.25;
}

.result-section.density-compact .meaning-en:not(.sentence) {
  font-size: 18px;
  margin-top: 2px;
  line-height: 1.25;
}

.result-section.density-compact .pronounce-row {
  margin-top: 4px;
  margin-bottom: 6px;
  gap: 6px;
}

.result-section.density-compact .pronounce-pill {
  padding: 3px 9px;
}

.result-section.density-compact .pronounce-ipa {
  font-size: 12px;
}

.result-section.density-compact .definition-text {
  font-size: 12.5px;
  line-height: 1.35;
  margin-bottom: 6px;
}

.result-section.density-compact .enhanced-badge {
  margin-bottom: 6px;
  font-size: 10px;
}

.result-section.density-compact .pairs-grid {
  gap: 6px;
  margin-bottom: 6px;
}

.result-section.density-compact .pair-card {
  padding: 6px 9px;
  gap: 3px;
}

.result-section.density-compact .pair-header {
  font-size: 11.5px;
}

.result-section.density-compact .pair-body {
  font-size: 11.5px;
  line-height: 1.3;
}

.result-section.density-compact .collocations-card {
  padding: 6px 9px;
  margin-bottom: 6px;
}

.result-section.density-compact .collocations-header {
  font-size: 11.5px;
  margin-bottom: 4px;
}

.result-section.density-compact .collocation-pill {
  padding: 3px 7px;
  font-size: 11px;
}

.result-section.density-compact .example-card {
  padding: 7px 10px;
  margin-bottom: 6px;
}

.result-section.density-compact .example-header {
  font-size: 11.5px;
  margin-bottom: 3px;
}

.result-section.density-compact .example-en {
  font-size: 12px;
  line-height: 1.35;
}

.result-section.density-compact .example-bn {
  font-size: 11.5px;
  margin-top: 2px;
  line-height: 1.3;
}

.result-section.density-compact .word-family-card {
  padding: 6px 9px;
  margin-bottom: 6px;
}

.result-section.density-compact .word-family-header {
  font-size: 11.5px;
  margin-bottom: 4px;
}

.result-section.density-compact .word-family-grid {
  gap: 3px 8px;
}

.result-section.density-compact .family-item {
  font-size: 11px;
}

.result-section.density-compact .mistake-card {
  padding: 6px 10px;
  margin-bottom: 6px;
}

.result-section.density-compact .mistake-header {
  font-size: 11.5px;
  margin-bottom: 3px;
}

.result-section.density-compact .mistake-body {
  font-size: 11px;
  line-height: 1.35;
}

.result-section.density-compact .actions-grid {
  gap: 8px;
  padding-top: 6px;
  margin-top: auto;
}

.result-section.density-compact .action-card-btn {
  height: 38px;
  border-radius: 6px;
  font-size: 12px;
}

/* Resize Grip at bottom right */
.resize-grip {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 14px;
  height: 14px;
  cursor: se-resize;
  background: rgba(56, 189, 248, 0.25);
  border-radius: 2px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  z-index: 10;
}

/* Secondary Views */
.secondary-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #e8edf2;
}

.history-item,
.provider-item {
  background: rgba(16, 24, 38, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.history-query {
  font-size: 14px;
  font-weight: 600;
  color: #38bdf8;
  cursor: pointer;
}

.history-query:hover {
  text-decoration: underline;
}

.history-meta {
  font-size: 11px;
  color: rgba(170, 184, 200, 0.65);
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.history-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  justify-content: flex-end;
}
`

export const btn: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'rgba(56, 189, 248, 0.12)',
  color: '#e8edf2',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid rgba(148,163,184,0.30)',
  background: 'rgba(10,14,21,0.55)',
  color: '#e8edf2',
  fontSize: 14,
}

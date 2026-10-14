import { createContext, useContext } from "react"

import type { Language } from "@/core/messages"

const en = {
  tabColor: "Color",
  tabTypography: "Typography",
  tabSize: "Size",
  tabEffects: "Effects",
  tabCss: "CSS",
  menu: "More",
  importTitle: "Import",
  importHint:
    "Paste a Tailwind v4 stylesheet. @theme, :root, and .dark blocks are read.",
  importPlaceholder: "@theme {\n  --color-brand-500: #3b82f6;\n}",
  importReplace: "Replace theme",
  importMerge: "Merge into theme",
  importConfirm: "This discards the current changes. Replace?",
  importConfirmYes: "Replace",
  cancel: "Cancel",
  importDone:
    "Imported {values} values, {removed} removals, {dark} dark values.",
  importUnresolved: "Could not follow var() in: {names}",
  importFonts: "Not available in Figma: {names}. Pick a family in Typography.",
  darkUnavailable:
    "This file's plan does not allow a second mode, so only light values were written.",
  exportTitle: "Export",
  exportHint: 'Paste this after @import "tailwindcss" in your stylesheet.',
  exportEmpty:
    "The theme matches Tailwind's defaults, so there is nothing to export.",
  copy: "Copy",
  copied: "Copied",
  filter: "Filter tokens",
  name: "name",
  value: "value",
  add: "Add",
  invalidValue: "Can't convert this value",
  invalidName: "Use lowercase letters, numbers, and hyphens",
  duplicateName: "This token already exists",
  reset: "Reset to default",
  remove: "Remove",
  rename: "Rename",
  modified: "Modified",
  added: "Added",
  layers: "{n} layer(s)",
  darkToggle: "Dark values",
  darkHint:
    "Saved with the theme. Creating a Dark mode in Figma needs a plan that allows modes.",
  darkPlaceholder: "same as light",
  fontSlots: "Font slots",
  fontSlotsHint: "Each slot maps to one font family available in Figma.",
  fontFamily: "Font family",
  fontMissing: "Not available in Figma",
  textStyles: "Text styles",
  slotName: "slot name",
  addSlot: "Add slot",
  selected: "{n} variables and styles selected",
  selectedShort: "{n} selected",
  defaultTheme: "Tailwind defaults",
  stepScope: "Scope",
  stepCompare: "Compare",
  compare: "Compare",
  backToEdit: "Back to editing",
  removedNote: "Removed {name}",
  undo: "Undo",
  noMatch: "No tokens match",
  review: "Review changes",
  comparing: "Comparing with the file…",
  applying: "Applying…",
  notChangedYet: "Nothing has changed yet.",
  appliedNote: "Applied. Undo once in Figma to revert.",
  back: "Back",
  apply: "Apply",
  done: "Done",
  toCreate: "To create",
  created: "Created",
  toUpdate: "To update",
  updated: "Updated",
  unchanged: "Unchanged",
  willOverwrite: "Will be overwritten",
  overwritten: "Overwritten",
  overwrittenHint: "Edited by hand in Figma since the last apply.",
  toDelete: "To delete",
  deleted: "Deleted",
  deletedHint:
    "Their tokens are no longer in the theme. Layers using them lose the binding.",
  toRename: "To rename",
  renamed: "Renamed",
  renamedHint: "Kept in place under the new name, so layers stay bound.",
  orphans: "Left in the file",
  orphansHint:
    "Unchecked for this apply, or not convertible right now, so they stay as they are.",
  resetTheme: "Reset theme",
  resetConfirm:
    "Discard every change and go back to Tailwind's defaults? Variables and styles for tokens you added are deleted the next time you apply.",
  resetYes: "Reset",
  otherColors: "other",
  changedCount: "{n} changed",
  skipped: "Skipped",
  skippedHint: "Text styles whose font has no matching weight.",
  unconverted: "Not converted",
  unconvertedHint:
    "Tokens whose values can't be turned into Figma values. Whatever the file already has for them stays.",
}

export type MessageKey = keyof typeof en

const ko: Record<MessageKey, string> = {
  tabColor: "색상",
  tabTypography: "타이포그래피",
  tabSize: "크기",
  tabEffects: "이펙트",
  tabCss: "CSS",
  menu: "더 보기",
  importTitle: "가져오기",
  importHint:
    "Tailwind v4 스타일시트를 붙여넣으세요. @theme, :root, .dark 블록을 읽습니다.",
  importPlaceholder: "@theme {\n  --color-brand-500: #3b82f6;\n}",
  importReplace: "테마 교체",
  importMerge: "테마에 병합",
  importConfirm: "현재 변경 내용이 사라집니다. 교체할까요?",
  importConfirmYes: "교체",
  cancel: "취소",
  importDone:
    "값 {values}개, 삭제 {removed}개, Dark 값 {dark}개를 가져왔습니다.",
  importUnresolved: "var() 참조를 풀지 못했습니다: {names}",
  importFonts:
    "Figma에 없는 폰트입니다: {names}. 타이포그래피 탭에서 고르세요.",
  darkUnavailable:
    "이 파일의 플랜에서는 모드를 추가할 수 없어 Light 값만 적용했습니다.",
  exportTitle: "내보내기",
  exportHint: '스타일시트의 @import "tailwindcss" 뒤에 붙여넣으세요.',
  exportEmpty: "테마가 Tailwind 기본값과 같아서 내보낼 내용이 없습니다.",
  copy: "복사",
  copied: "복사됨",
  filter: "토큰 검색",
  name: "이름",
  value: "값",
  add: "추가",
  invalidValue: "변환할 수 없는 값입니다",
  invalidName: "영문 소문자, 숫자, 하이픈만 쓸 수 있습니다",
  duplicateName: "이미 있는 토큰입니다",
  reset: "기본값으로 되돌리기",
  remove: "삭제",
  rename: "이름 변경",
  modified: "수정됨",
  added: "추가됨",
  layers: "{n}개 레이어",
  darkToggle: "Dark 값",
  darkHint:
    "테마와 함께 저장됩니다. Figma에 Dark 모드를 만들려면 모드를 지원하는 플랜이 필요합니다.",
  darkPlaceholder: "Light와 동일",
  fontSlots: "폰트 슬롯",
  fontSlotsHint: "슬롯마다 Figma에서 쓸 수 있는 폰트 패밀리 하나를 지정합니다.",
  fontFamily: "폰트 패밀리",
  fontMissing: "Figma에 없는 폰트입니다",
  textStyles: "Text 스타일",
  slotName: "슬롯 이름",
  addSlot: "슬롯 추가",
  selected: "변수와 스타일 {n}개 선택됨",
  selectedShort: "{n}개 선택",
  defaultTheme: "Tailwind 기본값",
  stepScope: "범위",
  stepCompare: "비교",
  compare: "비교하기",
  backToEdit: "편집으로",
  removedNote: "{name} 삭제됨",
  undo: "실행 취소",
  noMatch: "일치하는 토큰이 없습니다",
  review: "변경 내용 확인",
  comparing: "파일과 비교하는 중…",
  applying: "적용하는 중…",
  notChangedYet: "아직 아무것도 바뀌지 않았습니다.",
  appliedNote:
    "적용했습니다. Figma에서 실행 취소 한 번으로 되돌릴 수 있습니다.",
  back: "뒤로",
  apply: "적용",
  done: "완료",
  toCreate: "생성 예정",
  created: "생성됨",
  toUpdate: "갱신 예정",
  updated: "갱신됨",
  unchanged: "변경 없음",
  willOverwrite: "덮어쓸 항목",
  overwritten: "덮어쓴 항목",
  overwrittenHint: "마지막 적용 이후 Figma에서 직접 수정한 항목입니다.",
  toDelete: "삭제 예정",
  deleted: "삭제됨",
  deletedHint:
    "테마에서 빠진 토큰의 항목입니다. 이를 쓰던 레이어는 바인딩이 끊깁니다.",
  toRename: "이름 변경 예정",
  renamed: "이름 변경됨",
  renamedHint: "기존 항목에 새 이름만 붙이므로 레이어 바인딩이 유지됩니다.",
  orphans: "파일에 남는 항목",
  orphansHint:
    "이번 적용에서 체크 해제했거나 지금은 변환할 수 없는 항목이라 그대로 둡니다.",
  resetTheme: "테마 초기화",
  resetConfirm:
    "모든 변경을 버리고 Tailwind 기본값으로 돌아갈까요? 추가했던 토큰의 변수와 스타일은 다음 적용 때 삭제됩니다.",
  resetYes: "초기화",
  otherColors: "기타",
  changedCount: "{n}개 변경",
  skipped: "건너뜀",
  skippedHint: "폰트에 해당 굵기가 없는 Text 스타일입니다.",
  unconverted: "변환되지 않음",
  unconvertedHint:
    "Figma 값으로 바꿀 수 없는 토큰입니다. 파일에 이미 있는 항목은 그대로 둡니다.",
}

const MESSAGES: Record<Language, Record<MessageKey, string>> = { en, ko }

export type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export function createTranslate(language: Language): Translate {
  return (key, values = {}) =>
    MESSAGES[language][key].replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values[name] ?? "")
    )
}

export function detectLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en"
}

export const TranslateContext = createContext<Translate>(createTranslate("en"))

export function useTranslate() {
  return useContext(TranslateContext)
}

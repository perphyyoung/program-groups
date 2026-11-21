/** 备注键：应用与已忽略快捷方式共用一张 notes 表，用前缀区分 */
export function appNoteKey(appId: string): string {
  return `app:${appId}`;
}

export function shortcutNoteKey(shortcutPath: string): string {
  return `shortcut:${shortcutPath}`;
}

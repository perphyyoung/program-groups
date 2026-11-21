export interface RowMenuPaths {
  run: string | null;
  target: string | null;
  link: string | null;
}

export interface RowMenuExists {
  run: boolean;
  target: boolean;
  link: boolean;
}

export interface RowMenuActions {
  run: () => void;
  revealTarget: () => void;
  revealLink: () => void;
}

export interface RowMenuItem {
  label: string;
  disabled: boolean;
  title?: string;
  separatorAfter?: boolean;
  run: () => void;
}

export interface RowMenuSpec {
  paths: RowMenuPaths;
  actions: RowMenuActions;
}

export interface RowContextRequest {
  x: number;
  y: number;
  anchor: HTMLElement;
}

function unavailableReason(
  path: string | null,
  exists: boolean,
  noPath: string,
  missingFile: string,
): string | undefined {
  if (!path) return noPath;
  return exists ? undefined : missingFile;
}

/** 行菜单固定三项：启动、打开目标路径、打开链接路径；后两项在资源管理器中定位 */
export function buildRowMenu(
  paths: RowMenuPaths,
  exists: RowMenuExists,
  actions: RowMenuActions,
): RowMenuItem[] {
  return [
    {
      label: "启动",
      disabled: !paths.run || !exists.run,
      title: unavailableReason(paths.run, exists.run, "该行没有启动路径", "启动路径不存在"),
      separatorAfter: true,
      run: actions.run,
    },
    {
      label: "打开目标路径",
      disabled: !paths.target || !exists.target,
      title: unavailableReason(paths.target, exists.target, "该行没有目标路径", "目标路径不存在"),
      run: actions.revealTarget,
    },
    {
      label: "打开链接路径",
      disabled: !paths.link || !exists.link,
      title: unavailableReason(paths.link, exists.link, "该行没有链接路径", "链接路径不存在"),
      run: actions.revealLink,
    },
  ];
}

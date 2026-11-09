export const README_PLUGIN_START = "<!-- BEGIN AUTO-GENERATED PLUGIN LIST: DO NOT EDIT -->";
export const README_PLUGIN_END = "<!-- END AUTO-GENERATED PLUGIN LIST -->";

export const README_SPECS = [
  { file: "README.md", lang: "en" },
  { file: "README-zh-CN.md", lang: "zh" },
];

const README_ICON_SIZE = 16;
const README_ICON_RIGHT_PADDING = 6;
// Bottom padding raises the artwork's center 2px within the aligned image frame.
const README_ICON_BOTTOM_PADDING = 4;

const README_ICON_VIEW_BOXES = {
  "packages/dsh-auto-permission-default": "6.5,6.5,23,23",
  "packages/dsh-menu-search": "6.4,6.4,22,22",
  "packages/dsh-model-effort-memory": "7.5,7.5,22,22",
  "packages/dsh-pasted-text-file": "7.5,6.5,24,24",
  "packages/dsh-plugin-installed-order": "6.8,6,25.5,25.5",
  "packages/dsh-scrollbar-edge-hit": "7,7,23,23",
  "packages/dsh-session-grouping-bell": "7,6.5,24.5,24.5",
  "packages/dsh-session-workspace-label": "7,7.5,21.5,21.5",
  "packages/dsh-sidebar-scroll-flow": "6.5,6.5,23.5,23.5",
  "packages/dsh-worktrees": "7.5,7.5,21.5,21.5",
};

function repositoryDirectory(plugin) {
  const directory = plugin.repository?.directory;
  if (typeof directory !== "string" || !directory.startsWith("packages/")) {
    throw new Error(`invalid plugin repository directory for ${plugin.name}`);
  }
  return directory;
}

function readmeIconSource(directory) {
  const viewBox = README_ICON_VIEW_BOXES[directory];
  if (!viewBox) {
    throw new Error(`README icon viewBox is missing for ${directory}`);
  }
  const [x, y, width, height] = viewBox.split(",").map(Number);
  // Reserve display-space padding for the label gap and vertical alignment.
  const paddedWidth = Number((width + height * README_ICON_RIGHT_PADDING / README_ICON_SIZE).toFixed(4));
  const paddedHeight = Number((height + height * README_ICON_BOTTOM_PADDING / README_ICON_SIZE).toFixed(4));
  return `${directory}/icon.svg#svgView(viewBox(${x},${y},${paddedWidth},${paddedHeight}))`;
}

function escapeHtmlAttribute(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderPluginList(plugins, lang) {
  return plugins
    .map((plugin) => {
      const title = plugin.title?.[lang];
      const description = plugin.description?.[lang];
      if (!title || !description) {
        throw new Error(`locale metadata missing for ${plugin.name} (${lang})`);
      }
      const directory = repositoryDirectory(plugin);
      const alt = lang === "zh" ? `${title}图标` : `${title} icon`;
      return `<img src="${readmeIconSource(directory)}" alt="${escapeHtmlAttribute(alt)}" width="${README_ICON_SIZE + README_ICON_RIGHT_PADDING}" height="${README_ICON_SIZE + README_ICON_BOTTOM_PADDING}" align="absmiddle" />**[${title}](${directory})**<br>\n<sub>${description}</sub>`;
    })
    .join("\n\n");
}

export function renderPluginSection(plugins, lang) {
  return `${README_PLUGIN_START}\n\n${renderPluginList(plugins, lang)}\n\n${README_PLUGIN_END}`;
}

export function replacePluginSection(readme, plugins, lang) {
  const start = readme.indexOf(README_PLUGIN_START);
  const end = readme.indexOf(README_PLUGIN_END);
  if (start < 0 || end < start) {
    throw new Error(`README is missing a valid generated plugin section (${lang})`);
  }
  return `${readme.slice(0, start)}${renderPluginSection(plugins, lang)}${readme.slice(
    end + README_PLUGIN_END.length,
  )}`;
}

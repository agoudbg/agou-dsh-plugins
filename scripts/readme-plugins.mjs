export const README_PLUGIN_START = "<!-- BEGIN AUTO-GENERATED PLUGIN LIST: DO NOT EDIT -->";
export const README_PLUGIN_END = "<!-- END AUTO-GENERATED PLUGIN LIST -->";

export const README_SPECS = [
  { file: "README.md", lang: "en" },
  { file: "README-zh-CN.md", lang: "zh" },
];

function repositoryDirectory(plugin) {
  const directory = plugin.repository?.directory;
  if (typeof directory !== "string" || !directory.startsWith("packages/")) {
    throw new Error(`invalid plugin repository directory for ${plugin.name}`);
  }
  return directory;
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
      return `### <img src="${directory}/icon.svg" alt="${escapeHtmlAttribute(alt)}" width="36" height="36" align="left" /> [${title}](${directory})\n\n${description}`;
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

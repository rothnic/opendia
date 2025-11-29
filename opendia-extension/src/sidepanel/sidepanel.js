// OpenDia Side Panel - Page Structure Viewer
// Displays page structure analysis in real-time

let autoRefresh = false;
let currentTabId = null;

const refreshBtn = document.getElementById('refresh');
const autoRefreshCheckbox = document.getElementById('auto-refresh');
const contentEl = document.getElementById('content');
const statsEl = document.getElementById('stats');

// Initialize
async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  // Setup event listeners
  refreshBtn.addEventListener('click', () => analyzeCurrentPage());
  autoRefreshCheckbox.addEventListener('change', (e) => {
    autoRefresh = e.target.checked;
    if (autoRefresh) {
      analyzeCurrentPage();
    }
  });

  // Listen for tab changes
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    currentTabId = activeInfo.tabId;
    if (autoRefresh) {
      await analyzeCurrentPage();
    }
  });

  // Listen for navigation
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.tabId === currentTabId && autoRefresh) {
      // Wait a bit for page to settle
      setTimeout(() => analyzeCurrentPage(), 500);
    }
  });

  console.log('OpenDia Side Panel initialized');
}

async function analyzeCurrentPage() {
  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Analyzing...';
    contentEl.textContent = 'Analyzing page structure...';
    statsEl.classList.add('hidden');

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    currentTabId = tab.id;

    // Get user-selected options
    const format = document.getElementById('format-select').value;
    const maxDepth = parseInt(document.getElementById('max-depth').value) || 6;
    const maxNodes = parseInt(document.getElementById('max-nodes').value) || 200;

    // Send message to content script to get page structure
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'page_structure',
      data: {
        format: format,
        max_depth: maxDepth,
        max_nodes: maxNodes
      }
    });

    console.log('📥 Sidepanel received response:', response);

    if (response.error) {
      throw new Error(response.error);
    }

    // Display the result
    displayStructure(response.data);

  } catch (error) {
    console.error('Error analyzing page:', error);

    let errorMsg = `Error: ${error.message}`;

    if (error.message.includes('Receiving end does not exist') || error.message.includes('Could not establish connection')) {
      errorMsg = '⚠️ Content script not loaded.\n\nPlease refresh the webpage (Cmd+R / F5) to inject the OpenDia extension, then try again.';
    } else if (error.message.includes('No active tab')) {
      errorMsg = '⚠️ No active tab found.\n\nPlease select a webpage tab.';
    }

    contentEl.textContent = errorMsg;
    statsEl.classList.add('hidden');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

function displayStructure(result) {
  if (!result) {
    contentEl.textContent = 'No structure data returned';
    return;
  }

  // Handle both compact text format and JSON format
  let text;
  let metadata;
  let groupsCount = 0;

  if (result.format === 'compact' && result.text) {
    text = result.text;
    metadata = result.metadata;
    groupsCount = result.groupsCount || 0;
  } else if (result.metadata && result.outline) {
    // JSON format - convert to readable text
    metadata = result.metadata;
    groupsCount = (result.groups || []).length;
    text = formatJsonAsText(result);
  } else {
    text = JSON.stringify(result, null, 2);
  }

  contentEl.textContent = text;

  // Show stats
  if (metadata) {
    const stats = [];
    stats.push(`📄 ${metadata.title || 'Untitled'}`);
    stats.push(`🌐 ${new URL(metadata.url).hostname}`);
    if (groupsCount > 0) {
      stats.push(`📦 ${groupsCount} repeated group${groupsCount > 1 ? 's' : ''}`);
    }
    if (metadata.pagination?.next) {
      stats.push(`➡️ Has next page`);
    }

    statsEl.textContent = stats.join(' • ');
    statsEl.classList.remove('hidden');
  }
}

function formatJsonAsText(result) {
  const lines = [];
  const { metadata, groups = [], outline } = result;

  lines.push('=== PAGE ANALYSIS ===');
  lines.push(`Title: ${metadata.title}`);
  lines.push(`URL: ${metadata.url}`);
  if (metadata.pagination?.next) {
    lines.push('Pagination: [Next Page Available]');
  }
  lines.push('');

  if (groups.length > 0) {
    lines.push(`=== DETECTED REPEATED GROUPS (${groups.length}) ===`);
    groups.forEach(g => {
      lines.push(`[${g.id}] ${g.count} items`);
      lines.push(`  Selector: ${g.containerSelector} > ${g.itemSelector}`);
      const schemaKeys = Object.keys(g.schema || {});
      if (schemaKeys.length > 0) {
        lines.push(`  Schema: ${schemaKeys.slice(0, 5).join(', ')}`);
      }
    });
    lines.push('');
  }

  lines.push('=== STRUCTURE TREE ===');
  lines.push(formatTreeNode(outline));

  return lines.join('\n');
}

function formatTreeNode(node, depth = 0) {
  if (!node) return '';

  const indent = '  '.repeat(depth);
  const parts = [];

  parts.push(`@${node.id}`);

  let selector = node.tag;
  if (node.attributes?.id) selector += `#${node.attributes.id}`;
  if (node.attributes?.classes?.length) selector += `.${node.attributes.classes.join('.')}`;
  parts.push(selector);

  if (node.interactive) parts.push('🔵');
  if (node.landmark) parts.push('⭐');

  if (node.kind === 'repeated_group') {
    parts.push(`[GROUP: ${node.total} items]`);
  } else if (node.label) {
    parts.push(`"${node.label.substring(0, 50)}${node.label.length > 50 ? '...' : ''}"`);
  } else if (node.textPreview) {
    parts.push(`"${node.textPreview.substring(0, 50)}${node.textPreview.length > 50 ? '...' : ''}"`);
  }

  const line = `${indent}${parts.join(' ')}`;
  const lines = [line];

  if (node.kind === 'repeated_group') {
    (node.examples || []).forEach((ex, i) => {
      lines.push(`${indent}  Example ${i+1}:`);
      lines.push(formatTreeNode(ex, depth + 2));
    });
  } else if (node.children) {
    node.children.forEach(child => {
      lines.push(formatTreeNode(child, depth + 1));
    });
  }

  return lines.join('\n');
}

// Start
init();

document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
  // UI Elements
  const conversationsList = document.getElementById('conversationsList');
  const startButton = document.getElementById('startDeletion');
  const statusDiv = document.getElementById('status');
  const selectAllBtn = document.getElementById('selectAll');
  const deselectAllBtn = document.getElementById('deselectAll');
  const sortByDateBtn = document.getElementById('sortByDate');
  const sortByTitleBtn = document.getElementById('sortByTitle');
  const retryContainer = document.getElementById('retryContainer');
  const retryButton = document.getElementById('retryButton');

  let conversations = [];
  let currentSort = 'date'; // 'date' or 'title'
  let dateSortOrder = 'asc'; // 'asc' or 'desc'
  let monthGroups = {};

  // Initialize
  loadConversations();

  // Event Listeners
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = conversationsList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateDeleteButton();
  });

  deselectAllBtn.addEventListener('click', () => {
    const checkboxes = conversationsList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateDeleteButton();
  });

  sortByDateBtn.addEventListener('click', () => {
    currentSort = 'date';
    dateSortOrder = dateSortOrder === 'asc' ? 'desc' : 'asc';
    sortConversations();
    updateSortButtons();
  });

  sortByTitleBtn.addEventListener('click', () => {
    currentSort = 'title';
    sortConversations();
    updateSortButtons();
  });

  retryButton.addEventListener('click', () => {
    retryContainer.style.display = 'none';
    loadConversations();
  });

  startButton.addEventListener('click', async function() {
    const selectedConversations = Array.from(conversationsList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(checkbox => conversations.find(conv => conv.id === checkbox.dataset.id))
      .filter(Boolean);

    if (selectedConversations.length === 0) {
      showStatus('Please select at least one conversation to delete.', 'error');
      return;
    }

    try {
      startButton.disabled = true;
      startButton.textContent = 'Deleting...';
      
      const response = await chrome.runtime.sendMessage({
        action: 'deleteConversations',
        conversationIds: selectedConversations.map(conv => conv.id)
      });

      if (response.success) {
        showStatus(`Successfully deleted ${selectedConversations.length} conversations.`, 'success');
        loadConversations(); // Reload the list
      } else {
        showStatus('Error: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('Error in deletion process:', error);
      showStatus('Error: ' + error.message, 'error');
    } finally {
      startButton.disabled = false;
      updateDeleteButton();
    }
  });

  // Helper Functions
  function updateDeleteButton() {
    const selectedCount = conversationsList.querySelectorAll('input[type="checkbox"]:checked').length;
    startButton.textContent = `Delete Selected (${selectedCount})`;
    startButton.disabled = selectedCount === 0;
  }

  function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${isError ? 'error' : ''}`;
    if (isError) {
      retryContainer.style.display = 'block';
    } else {
      retryContainer.style.display = 'none';
    }
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }

  function updateSortButtons() {
    sortByDateBtn.classList.toggle('active', currentSort === 'date');
    sortByTitleBtn.classList.toggle('active', currentSort === 'title');
    sortByDateBtn.textContent = `Sort by Date ${currentSort === 'date' ? (dateSortOrder === 'asc' ? '↑' : '↓') : ''}`;
  }

  function sortConversations() {
    conversations.sort((a, b) => {
      if (currentSort === 'date') {
        // Convert timestamps to numbers for proper comparison
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        return a.title.localeCompare(b.title);
      }
    });
    renderConversations(conversations);
  }

  async function loadConversations() {
    try {
      conversationsList.innerHTML = '<div class="loading">Loading conversations...<br><span class="loading-progress">Fetching all conversations, this may take a moment...</span></div>';
      
      const response = await chrome.runtime.sendMessage({ action: 'getConversations' });
      
      if (response.success) {
        conversations = response.conversations;
        // Ensure timestamps are properly formatted
        conversations = conversations.map(conv => ({
          ...conv,
          timestamp: new Date(conv.timestamp).toISOString(),
          created_at: new Date(conv.created_at).toISOString()
        }));
        
        if (conversations.length === 0) {
          conversationsList.innerHTML = '<div class="loading">No conversations found</div>';
        } else {
          sortConversations();
          showStatus(`Loaded ${conversations.length} conversations`, 'success');
        }
      } else {
        showStatus('Error loading conversations: ' + response.error, 'error');
        conversationsList.innerHTML = '<div class="loading">Failed to load conversations</div>';
      }
    } catch (error) {
      console.error('Error in loadConversations:', error);
      showStatus('Error: ' + error.message, 'error');
      conversationsList.innerHTML = '<div class="loading">Failed to load conversations</div>';
    }
  }

  function groupConversationsByMonth(conversations) {
    const groups = {};
    conversations.forEach(conv => {
      const date = new Date(conv.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[monthKey]) {
        groups[monthKey] = {
          month: date,
          conversations: []
        };
      }
      groups[monthKey].conversations.push(conv);
    });
    return groups;
  }

  function formatMonth(date) {
    return date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  }

  function renderConversations(conversations) {
    if (conversations.length === 0) {
      conversationsList.innerHTML = '<div class="loading">No conversations found</div>';
      return;
    }

    // Group conversations by month
    monthGroups = groupConversationsByMonth(conversations);

    // Sort month groups by date
    const sortedMonthKeys = Object.keys(monthGroups).sort((a, b) => {
      return dateSortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
    });

    conversationsList.innerHTML = sortedMonthKeys.map(monthKey => {
      const group = monthGroups[monthKey];
      return `
        <div class="month-group">
          <div class="month-header">
            <input type="checkbox" class="month-checkbox" data-month="${monthKey}">
            <span>${formatMonth(group.month)}</span>
          </div>
          <div class="month-content">
            ${group.conversations.map(conv => `
              <div class="conversation-item">
                <input type="checkbox" data-id="${conv.id}">
                <span class="conversation-title" title="${conv.title}">${conv.title}</span>
                <span class="conversation-date">${formatDate(conv.timestamp)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners
    conversationsList.querySelectorAll('.month-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target !== header.querySelector('input')) {
          const content = header.nextElementSibling;
          content.classList.toggle('collapsed');
        }
      });
    });

    conversationsList.querySelectorAll('.month-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const monthKey = e.target.dataset.month;
        const group = monthGroups[monthKey];
        const monthCheckboxes = group.conversations.map(conv => 
          conversationsList.querySelector(`input[data-id="${conv.id}"]`)
        );
        monthCheckboxes.forEach(cb => cb.checked = e.target.checked);
        updateDeleteButton();
      });
    });

    conversationsList.querySelectorAll('input[type="checkbox"]:not(.month-checkbox)').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        updateDeleteButton();
        updateMonthCheckboxes();
      });
    });

    updateDeleteButton();
  }

  function updateMonthCheckboxes() {
    Object.entries(monthGroups).forEach(([monthKey, group]) => {
      const monthCheckbox = conversationsList.querySelector(`.month-checkbox[data-month="${monthKey}"]`);
      const monthConversations = group.conversations.map(conv => 
        conversationsList.querySelector(`input[data-id="${conv.id}"]`)
      );
      const allChecked = monthConversations.every(cb => cb.checked);
      const someChecked = monthConversations.some(cb => cb.checked);
      
      monthCheckbox.checked = allChecked;
      monthCheckbox.indeterminate = someChecked && !allChecked;
    });
  }

  function formatDate(timestamp) {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  }
}); 
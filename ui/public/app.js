                const themeToggles = document.querySelectorAll('.theme-toggle');

                function updateUI(theme) {
                    const isDark = theme === 'dark';
                    themeToggles.forEach(toggle => {
                        const themeText = toggle.querySelector('.theme-text');
                        const themeIcon = toggle.querySelector('.theme-icon');
                        if (themeText) themeText.textContent = isDark ? 'Switch to Light' : 'Switch to Dark';
                        if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
                        toggle.setAttribute('aria-pressed', isDark);
                        toggle.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
                    });
                    document.documentElement.setAttribute('data-theme', theme);
                }

                updateUI(document.documentElement.getAttribute('data-theme'));

                // Archetype Info Handler
                const archetypeNodes = document.querySelectorAll('.archetype-node');
                const archetypeInfo = document.getElementById('archetype-info');

                archetypeNodes.forEach(node => {
                    const showInfo = () => {
                        const nameNode = node.querySelector('.archetype-name');
                        const name = nameNode ? nameNode.textContent : 'Unknown';
                        const mandate = node.getAttribute('data-mandate');
                        archetypeInfo.innerHTML = '<span class="mandate-label">' + name + ' Mandate:</span>' + mandate;
                        archetypeInfo.style.opacity = '1';
                    };

                    const hideInfo = () => {
                        archetypeInfo.innerHTML = '<div class="info-placeholder">Hover or focus on an archetype node to view its mandate.</div>';
                    };

                    node.addEventListener('mouseenter', showInfo);
                    node.addEventListener('focus', showInfo);
                    node.addEventListener('mouseleave', hideInfo);
                    node.addEventListener('blur', hideInfo);
                });

                themeToggles.forEach(toggle => {
                    toggle.addEventListener('click', () => {
                        const currentTheme = document.documentElement.getAttribute('data-theme');
                        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                        localStorage.setItem('theme', newTheme);
                        updateUI(newTheme);
                    });
                });

                const copyButton = document.getElementById('copy-curl');
                const copyText = document.getElementById('copy-text');
                const curlCommand = document.getElementById('curl-command');
                const userIdInput = document.getElementById('user-id-input');
                const userIdCounter = document.getElementById('user-id-counter');
                const clearUserIdBtn = document.getElementById('clear-user-id-btn');
                const createSessionBtn = document.getElementById('create-session-btn');

                function updateCurlCommand() {
                    const currentOrigin = window.location.origin;
                    const userId = userIdInput.value.trim() || 'demo-user';

                    if (window.currentSessionToken) {
                        curlCommand.textContent = `curl ${currentOrigin}/mcp/check -H "x-user-id: ${userId}" -H "x-session-token: ${window.currentSessionToken}"`;
                    } else {
                        curlCommand.textContent = `curl -X POST ${currentOrigin}/mcp -H "x-user-id: ${userId}"`;
                    }

                    const length = userIdInput.value.length;
                    userIdCounter.textContent = `${length} of 128 characters used`;
                    if (length >= 120) {
                        userIdCounter.classList.add('near-limit');
                    } else {
                        userIdCounter.classList.remove('near-limit');
                    }

                    if (clearUserIdBtn) {
                        clearUserIdBtn.style.display = length > 0 ? 'block' : 'none';
                    }
                }

                if (clearUserIdBtn) {
                    clearUserIdBtn.addEventListener('click', () => {
                        userIdInput.value = '';
                        updateCurlCommand();
                        userIdInput.focus();
                    });
                }

                userIdInput.addEventListener('input', updateCurlCommand);
                userIdInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        createSessionBtn.click();
                    }
                });
                updateCurlCommand();

                createSessionBtn.addEventListener('click', async () => {
                    const userId = userIdInput.value.trim() || 'demo-user';
                    const btnText = createSessionBtn.querySelector('.btn-text');
                    const originalHTML = createSessionBtn.innerHTML;

                    try {
                        createSessionBtn.disabled = true;
                        createSessionBtn.setAttribute('aria-busy', 'true');
                        if (btnText) btnText.textContent = 'Creating...';

                        const response = await fetch('/mcp', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-user-id': userId
                            },
                            body: JSON.stringify({})
                        });

                        if (response.ok) {
                            const data = await response.json();
                            window.currentSessionId = data.sessionId;
                            if (btnText) btnText.textContent = 'Created! ✅';
                            setTimeout(() => {
                                createSessionBtn.innerHTML = originalHTML;
                                createSessionBtn.disabled = false;
                                createSessionBtn.setAttribute('aria-busy', 'false');
                            }, 2000);
                        } else {
                            if (btnText) btnText.textContent = 'Failed. Try again ❌';
                            setTimeout(() => {
                                createSessionBtn.innerHTML = originalHTML;
                                createSessionBtn.disabled = false;
                                createSessionBtn.setAttribute('aria-busy', 'false');
                            }, 2000);
                        }
                    } catch (err) {
                        console.error('Session creation failed:', err);
                        if (btnText) btnText.textContent = 'Error ❌';
                        setTimeout(() => {
                            createSessionBtn.innerHTML = originalHTML;
                            createSessionBtn.disabled = false;
                            createSessionBtn.setAttribute('aria-busy', 'false');
                        }, 2000);
                    }
                });

                copyButton.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(curlCommand.textContent);
                        copyButton.classList.add('copied');
                        copyButton.setAttribute('aria-label', 'Command copied to clipboard');
                        copyText.textContent = 'Copied!';
                        setTimeout(() => {
                            copyButton.classList.remove('copied');
                            copyButton.setAttribute('aria-label', 'Copy command to clipboard');
                            copyText.textContent = 'Copy';
                        }, 2000);
                    } catch (err) {
                        console.error('Failed to copy: ', err);
                    }
                });

                // Global Shortcuts
                window.addEventListener('keydown', (e) => {
                    if (document.documentElement.classList.contains('shortcuts-disabled')) return;
                    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
                    if (e.ctrlKey || e.metaKey || e.altKey) return;
                    if (e.key === 'c') {
                        document.getElementById('copy-curl')?.click();
                    } else if (e.key === 't') {
                        document.querySelector('.theme-toggle')?.click();
                    } else if (e.key === '/') {
                        e.preventDefault();
                        userIdInput.focus();
                        userIdInput.select();
                    } else if (e.key === 's') {
                        createSessionBtn.click();
                    } else if (e.key === 'e') {
                        const btn = document.getElementById('extend-session-btn');
                        if (btn && window.getComputedStyle(document.getElementById('timeout-banner')).display !== 'none') {
                            btn.click();
                        }
                    }
                });

                // Session Timeout Simulation
                let timeoutWarning;
                window.currentSessionToken = null;
                const SESSION_DURATION = 3600 * 1000;
                const WARNING_TIME = 60 * 1000;

                function resetTimer() {
                    if (timeoutWarning) clearTimeout(timeoutWarning);
                    document.getElementById('timeout-banner').style.display = 'none';

                    timeoutWarning = setTimeout(() => {
                        document.getElementById('timeout-banner').style.display = 'flex';
                    }, SESSION_DURATION - WARNING_TIME);
                }

                let statusTimeout;
                document.getElementById('extend-session-btn').addEventListener('click', async (e) => {
                    const btn = e.currentTarget;
                    const btnText = btn.querySelector('.btn-text');
                    const status = document.getElementById('extension-status');
                    const originalHTML = btn.innerHTML;

                    const showStatus = (msg, isError = false) => {
                        if (statusTimeout) clearTimeout(statusTimeout);
                        status.textContent = msg;
                        status.style.color = isError ? 'var(--error)' : 'var(--success)';
                        statusTimeout = setTimeout(() => status.textContent = '', 3000);
                    };

                    const resetBtn = () => {
                        btn.disabled = false;
                        btn.setAttribute('aria-busy', 'false');
                        btn.innerHTML = originalHTML;
                    };

                    try {
                        btn.disabled = true;
                        btn.setAttribute('aria-busy', 'true');
                        if (btnText) btnText.textContent = 'Extending...';

                        if (currentSessionToken) {
                            const response = await fetch('/session/extend', {
                                method: 'POST',
                                headers: {
                                    'x-user-id': userIdInput.value.trim() || 'demo-user',
                                    'x-session-token': currentSessionToken
                                }
                            });
                            if (response.ok) {
                                resetTimer();
                                if (btnText) btnText.textContent = 'Extended! ✅';
                                showStatus('Success');
                                setTimeout(resetBtn, 2000);
                            } else {
                                if (btnText) btnText.textContent = 'Failed. Try again ❌';
                                showStatus('Failed', true);
                                setTimeout(resetBtn, 2000);
                            }
                        } else {
                            // Simulation mode
                            await new Promise(resolve => setTimeout(resolve, 500));
                            resetTimer();
                            if (btnText) btnText.textContent = 'Reset! ✅';
                            showStatus('Reset');
                            setTimeout(resetBtn, 2000);
                        }
                    } catch (err) {
                        console.error('Extension failed:', err);
                        if (btnText) btnText.textContent = 'Error ❌';
                        showStatus('Error', true);
                        setTimeout(resetBtn, 2000);
                    }
                });

                // Intercept session creation to track Token for extension
                const originalFetch = window.fetch;
                window.fetch = async (...args) => {
                    const response = await originalFetch(...args);
                    if (typeof args[0] === 'string' && args[0].includes('/mcp') && args[1]?.method === 'POST') {
                        const data = await response.clone().json();
                        if (data.sessionToken) {
                            window.currentSessionToken = data.sessionToken;
                            updateCurlCommand();
                        }
                    }
                    return response;
                };

                // Keyboard Shortcut Toggle (WCAG 2.1.4 compliant)
                const toggleShortcutsBtn = document.getElementById('toggle-shortcuts-btn');

                function updateShortcutsUI(disabled) {
                    const isNowDisabled = !!disabled;
                    if (isNowDisabled) {
                        document.documentElement.classList.add('shortcuts-disabled');
                        toggleShortcutsBtn?.setAttribute('aria-pressed', 'true');
                        toggleShortcutsBtn?.setAttribute('aria-label', 'Enable single-key keyboard shortcuts');
                        const toggleText = toggleShortcutsBtn?.querySelector('.shortcut-toggle-text');
                        if (toggleText) toggleText.textContent = 'Enable Keyboard Shortcuts';
                    } else {
                        document.documentElement.classList.remove('shortcuts-disabled');
                        toggleShortcutsBtn?.setAttribute('aria-pressed', 'false');
                        toggleShortcutsBtn?.setAttribute('aria-label', 'Disable single-key keyboard shortcuts');
                        const toggleText = toggleShortcutsBtn?.querySelector('.shortcut-toggle-text');
                        if (toggleText) toggleText.textContent = 'Disable Keyboard Shortcuts';
                    }
                }

                if (toggleShortcutsBtn) {
                    const shortcutsDisabled = localStorage.getItem('shortcuts-disabled') === 'true';
                    updateShortcutsUI(shortcutsDisabled);

                    toggleShortcutsBtn.addEventListener('click', () => {
                        const currentlyDisabled = document.documentElement.classList.contains('shortcuts-disabled');
                        const newState = !currentlyDisabled;
                        localStorage.setItem('shortcuts-disabled', String(newState));
                        updateShortcutsUI(newState);
                    });
                }

                resetTimer();

// Phase 1 (PWA): register the service worker from site root (scope "/").
// Guard: secure origins only; registration failure must never break the page.
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(window.location.hostname))) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.error('SW registration failed:', err);
        });
    });
}

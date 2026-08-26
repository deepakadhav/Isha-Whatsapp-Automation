// ==UserScript==
// @name         Ishangam Call Campaign WhatsApp Automation (Anti-Ban Safe Edition)
// @namespace    https://ishangam.isha.in/
// @version      2.1.0
// @description  Anti-Ban Safe WhatsApp Web Campaign Automation with Dynamic Message Limits, Randomized Human Delays (10s to 3 min), Batch Cooldowns, Contact Personalization, Single-Tab Reuse, and Delivery Confirmation.
// @author       Antigravity
// @match        *://ishangam.isha.in/call_campaign/*
// @match        *://web.whatsapp.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // ANTI-BAN SAFE CONFIGURATION SETTINGS
    // ==========================================
    const CONFIG = {
        defaultRemark: "whatsapp send",
        autoSendWhatsAppWeb: true,   // Set false for Semi-Auto Mode (You click Send manually)
        autoCloseWhatsAppTab: false, // KEEP SAME TAB OPEN for all numbers
        
        // Anti-Ban Humanization Delays (10 sec to 3 min)
        defaultMinDelaySec: 10,      // Minimum 10 seconds between messages
        defaultMaxDelaySec: 180,     // Maximum 3 minutes (180 seconds) between messages
        
        // Dynamic Max Send Limit per Run (e.g. 30)
        defaultMaxMessages: 30,      // Default limit of messages to send on a run (0 = unlimited)
        
        // Anti-Ban Batch Cooldowns
        batchSize: 10,               // Additional cooldown check every 10 messages if enabled
        batchCooldownMs: 180000,     // 3 minutes (180s) cooldown break between batches
        
        maxWaWaitTimeoutMs: 60000    // 60s safety timeout for loading/sending
    };

    // Storage Keys
    const AUTO_LOOP_KEY = "ishangam_auto_campaign_loop_active";
    const WA_SIGNAL_KEY = "ishangam_wa_msg_sent_signal_gm";
    const WA_NAV_URL_KEY = "ishangam_wa_nav_target_url_gm";
    const WA_TAB_ALIVE_KEY = "ishangam_wa_tab_is_alive_gm";
    const MSG_COUNT_KEY = "ishangam_session_sent_count";
    const RUN_SENT_COUNT_KEY = "ishangam_run_sent_count";
    const MAX_LIMIT_KEY = "ishangam_max_msg_limit";
    const MIN_DELAY_KEY = "ishangam_min_delay_sec";
    const MAX_DELAY_KEY = "ishangam_max_delay_sec";

    // Helper: Format seconds into readable "2m 15s" or "45s"
    function formatTime(totalSeconds) {
        if (totalSeconds < 60) {
            return `${totalSeconds}s`;
        }
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    }

    // Helper: Generate random integer between min and max (inclusive)
    function getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // ==========================================
    // 1. ISHANGAM CALL CAMPAIGN AUTOMATION
    // ==========================================
    if (window.location.hostname.includes("ishangam.isha.in")) {
        console.log("[Ishangam Auto] Script loaded - Anti-Ban Safe Edition (v2.1.0)");

        let countdownTimer = null;
        let waWaitInterval = null;
        let waWaitTimeout = null;
        let listenerId = null;

        function isAutoLoopActive() {
            return GM_getValue(AUTO_LOOP_KEY, "false") === "true" || localStorage.getItem(AUTO_LOOP_KEY) === "true";
        }

        function setAutoLoopState(active) {
            GM_setValue(AUTO_LOOP_KEY, active ? "true" : "false");
            localStorage.setItem(AUTO_LOOP_KEY, active ? "true" : "false");
            updateUIState();
        }

        // Total Lifetime / Session Sent Count
        function getSentCount() {
            return parseInt(localStorage.getItem(MSG_COUNT_KEY) || GM_getValue(MSG_COUNT_KEY, "0"), 10);
        }

        function incrementSentCount() {
            let count = getSentCount() + 1;
            localStorage.setItem(MSG_COUNT_KEY, count.toString());
            GM_setValue(MSG_COUNT_KEY, count.toString());
            return count;
        }

        // Current Run Sent Count (vs Target Limit)
        function getRunSentCount() {
            return parseInt(localStorage.getItem(RUN_SENT_COUNT_KEY) || GM_getValue(RUN_SENT_COUNT_KEY, "0"), 10);
        }

        function incrementRunSentCount() {
            let count = getRunSentCount() + 1;
            localStorage.setItem(RUN_SENT_COUNT_KEY, count.toString());
            GM_setValue(RUN_SENT_COUNT_KEY, count.toString());
            return count;
        }

        function resetRunSentCount() {
            localStorage.setItem(RUN_SENT_COUNT_KEY, "0");
            GM_setValue(RUN_SENT_COUNT_KEY, "0");
            updateCounterDisplay();
            showToast("Run counter reset to 0", "info");
        }

        // Max Messages Limit Getter & Setter
        function getMaxMessagesLimit() {
            const val = GM_getValue(MAX_LIMIT_KEY, localStorage.getItem(MAX_LIMIT_KEY));
            if (val === null || val === undefined || val === "") return CONFIG.defaultMaxMessages;
            return parseInt(val, 10);
        }

        function setMaxMessagesLimit(limit) {
            const num = Math.max(0, parseInt(limit, 10) || 0);
            GM_setValue(MAX_LIMIT_KEY, num.toString());
            localStorage.setItem(MAX_LIMIT_KEY, num.toString());
            updateCounterDisplay();
            return num;
        }

        // Delay Range (Min & Max in seconds)
        function getMinDelaySec() {
            const val = GM_getValue(MIN_DELAY_KEY, localStorage.getItem(MIN_DELAY_KEY));
            return val !== null && val !== undefined && val !== "" ? Math.max(5, parseInt(val, 10)) : CONFIG.defaultMinDelaySec;
        }

        function setMinDelaySec(sec) {
            const val = Math.max(5, parseInt(sec, 10) || CONFIG.defaultMinDelaySec);
            GM_setValue(MIN_DELAY_KEY, val.toString());
            localStorage.setItem(MIN_DELAY_KEY, val.toString());
        }

        function getMaxDelaySec() {
            const val = GM_getValue(MAX_DELAY_KEY, localStorage.getItem(MAX_DELAY_KEY));
            const min = getMinDelaySec();
            return val !== null && val !== undefined && val !== "" ? Math.max(min, parseInt(val, 10)) : CONFIG.defaultMaxDelaySec;
        }

        function setMaxDelaySec(sec) {
            const min = getMinDelaySec();
            const val = Math.max(min, parseInt(sec, 10) || CONFIG.defaultMaxDelaySec);
            GM_setValue(MAX_DELAY_KEY, val.toString());
            localStorage.setItem(MAX_DELAY_KEY, val.toString());
        }

        function cleanupListeners() {
            if (listenerId && typeof GM_removeValueChangeListener === "function") {
                try { GM_removeValueChangeListener(listenerId); } catch (e) {}
                listenerId = null;
            }
            if (waWaitInterval) {
                clearInterval(waWaitInterval);
                waWaitInterval = null;
            }
            if (waWaitTimeout) {
                clearTimeout(waWaitTimeout);
                waWaitTimeout = null;
            }
        }

        // Main Action: Reuses WhatsApp Web tab via GM signal, waits for delivery, then marks Complete & Submits
        function executeWhatsAppFlow(autoSubmit = false) {
            try {
                // Safety check: before sending, verify if limit is already hit
                const maxLimit = getMaxMessagesLimit();
                const runSent = getRunSentCount();
                if (maxLimit > 0 && runSent >= maxLimit && isAutoLoopActive()) {
                    console.log(`[Ishangam Auto] Max limit already reached (${runSent}/${maxLimit}).`);
                    setAutoLoopState(false);
                    showToast(`🎯 Target limit reached (${runSent}/${maxLimit})! Loop stopped.`, "success");
                    return;
                }

                GM_deleteValue(WA_SIGNAL_KEY);

                let waUrl = getWhatsAppUrl();
                if (!waUrl) {
                    showToast("❌ WhatsApp URL not found for this lead!", "danger");
                    setAutoLoopState(false);
                    return;
                }

                // Personalize message with contact lead's name if available
                let contactName = getContactName();
                let targetUrl = waUrl;
                
                if (contactName && targetUrl.includes("text=")) {
                    targetUrl = personalizeWaUrl(targetUrl, contactName);
                }

                if (!targetUrl.includes("autoSend=1")) {
                    targetUrl += (targetUrl.includes("?") ? "&" : "?") + "autoSend=1";
                }

                const statusDiv = document.getElementById('auto-loop-status');
                if (statusDiv) {
                    statusDiv.innerHTML = `⏳ Sending WhatsApp message...`;
                    statusDiv.style.color = '#fde047';
                }

                // CHECK IF WHATSAPP TAB IS ALREADY OPEN AND ALIVE
                const isTabAlive = GM_getValue(WA_TAB_ALIVE_KEY, false);

                if (isTabAlive) {
                    console.log("[Ishangam Auto] Navigating in existing WhatsApp tab...");
                    showToast("Navigating in existing WhatsApp tab...", "info");
                    GM_setValue(WA_NAV_URL_KEY, targetUrl);
                } else {
                    console.log("[Ishangam Auto] Opening initial WhatsApp Web tab...");
                    showToast("Opening initial WhatsApp Web tab...", "info");
                    const waWin = window.open(targetUrl, 'ishangam_whatsapp_single_tab');
                    if (waWin) waWin.focus();
                }

                // Start Handshake Listener: Wait for GM_setValue signal from web.whatsapp.com
                listenForSendConfirmation((result) => {
                    if (result && result.invalid) {
                        console.warn("[Ishangam Auto] Invalid WhatsApp number detected!");
                        showToast("⚠️ Invalid WhatsApp Number! Marked Invalid.", "warning");
                        setCallOutcome("invalid_number");
                    } else {
                        console.log("[Ishangam Auto] WhatsApp send confirmed! Marking outcome & remarks...");
                        setCallOutcome("call_completed");
                        setCallingRemarks(CONFIG.defaultRemark);
                        
                        let currentRunSent = incrementRunSentCount();
                        incrementSentCount();
                        updateCounterDisplay();

                        const currentMax = getMaxMessagesLimit();
                        showToast(`✅ Sent! (${currentRunSent}/${currentMax > 0 ? currentMax : '∞'} in this run)`, "success");

                        // Check if this send reached the target limit
                        if (currentMax > 0 && currentRunSent >= currentMax) {
                            console.log(`[Ishangam Auto] Run target of ${currentMax} messages reached!`);
                            setAutoLoopState(false);
                            showToast(`🎉 Target of ${currentMax} messages completed! Safe Loop stopped.`, "success");
                            if (statusDiv) {
                                statusDiv.innerHTML = `🎯 Target reached (${currentRunSent}/${currentMax})`;
                                statusDiv.style.color = '#38bdf8';
                            }
                            if (autoSubmit) {
                                setTimeout(() => submitNextContact(), 1000);
                            }
                            return;
                        }
                    }

                    // Submit & Get Next lead if autoSubmit is enabled
                    if (autoSubmit || isAutoLoopActive()) {
                        if (statusDiv) statusDiv.innerHTML = `✅ Confirmed! Loading next lead...`;
                        setTimeout(() => {
                            submitNextContact();
                        }, 800);
                    }
                });

            } catch (err) {
                console.error("[Ishangam Auto] Error executing workflow:", err);
                showToast("Error: " + err.message, "danger");
                setAutoLoopState(false);
            }
        }

        // Extract lead's name from page
        function getContactName() {
            const h1El = document.querySelector('h1.d-inline-block, .card-header h1');
            if (h1El) {
                return h1El.innerText.trim();
            }
            return null;
        }

        // Insert lead name into message text for uniqueness
        function personalizeWaUrl(rawUrl, name) {
            try {
                let urlObj = new URL(rawUrl);
                let text = urlObj.searchParams.get("text");
                if (text && !text.startsWith("Namaskaram " + name)) {
                    text = text.replace(/^Namaskaram(!|\s|🙏)*/i, `Namaskaram ${name}! 🙏\n\n`);
                    urlObj.searchParams.set("text", text);
                    return urlObj.toString();
                }
            } catch (e) {}
            return rawUrl;
        }

        // Cross-Origin GM Value Listener
        function listenForSendConfirmation(onSuccessCallback) {
            cleanupListeners();

            if (typeof GM_addValueChangeListener === "function") {
                listenerId = GM_addValueChangeListener(WA_SIGNAL_KEY, (name, oldVal, newVal, remote) => {
                    if (newVal) {
                        handleSignalReceived(newVal);
                    }
                });
            }

            waWaitInterval = setInterval(() => {
                const val = GM_getValue(WA_SIGNAL_KEY, null);
                if (val) {
                    handleSignalReceived(val);
                }
            }, 300);

            // Safety Timeout (60 seconds)
            waWaitTimeout = setTimeout(() => {
                cleanupListeners();
                console.warn("[Ishangam Auto] Timeout waiting for WhatsApp message confirmation.");
                showToast("⚠️ WhatsApp Send Timeout! Auto-loop paused for safety.", "warning");
                const statusDiv = document.getElementById('auto-loop-status');
                if (statusDiv) statusDiv.innerHTML = `⚠️ Timeout (Paused)`;
                setAutoLoopState(false);
            }, CONFIG.maxWaWaitTimeoutMs);

            function handleSignalReceived(rawVal) {
                cleanupListeners();
                GM_deleteValue(WA_SIGNAL_KEY);
                try {
                    const data = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
                    onSuccessCallback(data);
                } catch (e) {
                    onSuccessCallback({ sent: true });
                }
            }
        }

        // Extract WhatsApp API / Web URL
        function getWhatsAppUrl() {
            const waButton = document.querySelector('button[onclick*="openWhatsApp"], button[data-url*="whatsapp.com"]');
            if (waButton && waButton.getAttribute('data-url')) {
                return formatWaWebUrl(waButton.getAttribute('data-url'));
            }

            const waLink = document.querySelector('a.partner_whatsapp');
            if (waLink) {
                let url = waLink.getAttribute('data-url') || waLink.getAttribute('href');
                if (url && url.includes("whatsapp.com")) return formatWaWebUrl(url);
            }

            const anyWa = document.querySelector('[data-url*="whatsapp.com"], a[href*="whatsapp.com"]');
            if (anyWa) {
                let url = anyWa.getAttribute('data-url') || anyWa.getAttribute('href');
                return formatWaWebUrl(url);
            }

            return null;
        }

        function formatWaWebUrl(rawUrl) {
            if (!rawUrl) return null;
            let decoded = rawUrl.replace(/&amp;/g, '&');
            if (decoded.includes("api.whatsapp.com/send")) {
                decoded = decoded.replace("https://api.whatsapp.com/send", "https://web.whatsapp.com/send");
            }
            return decoded;
        }

        // Select Call Outcome in dropdown
        function setCallOutcome(val = "call_completed") {
            let selectEl = document.querySelector('form.js_call_campaignform select.js_portal_call_status')
                || document.querySelector('form.js_call_campaignform select[name$="_status"]')
                || document.querySelector('select.js_portal_call_status')
                || Array.from(document.querySelectorAll('select')).find(s => s.name && s.name.endsWith('_status') && s.name !== 'try_alt_call_status');

            if (!selectEl) {
                console.warn("[Ishangam Auto] Call Outcome select element not found.");
                return false;
            }

            selectEl.value = val;

            let targetOption = Array.from(selectEl.options).find(opt => opt.value === val);
            if (targetOption) {
                Array.from(selectEl.options).forEach(opt => opt.selected = false);
                targetOption.selected = true;
            }

            selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            selectEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            if (window.$) {
                try {
                    window.$(selectEl).val(val).trigger('change').trigger('input');
                } catch (e) {}
            }

            const outcomeDep = document.querySelector('.js_portal-outcome-dependent');
            if (outcomeDep) {
                outcomeDep.classList.remove('d-none');
                outcomeDep.style.display = 'block';
            }

            const feedbackWrap = document.querySelector('.js_portal-feedback-wrap');
            if (feedbackWrap) {
                feedbackWrap.classList.remove('d-none');
                feedbackWrap.style.display = 'block';
            }

            const remarksWrap = document.querySelector('.js_portal-remarks-wrap');
            if (remarksWrap) {
                remarksWrap.classList.remove('d-none');
                remarksWrap.style.display = 'block';
            }

            const errZone = selectEl.closest('.js_question-wrapper')?.querySelector('.js_errzone');
            if (errZone) {
                errZone.style.display = 'none';
                errZone.innerText = '';
            }

            return true;
        }

        // Fill Calling Remarks textarea
        function setCallingRemarks(remarkText = "whatsapp send") {
            const remarkEl = document.querySelector('form.js_call_campaignform textarea.js_portal-remarks-input, textarea.js_portal-remarks-input, textarea[name$="_contact_remark"]');
            if (!remarkEl) {
                console.warn("[Ishangam Auto] Remarks textarea not found.");
                return false;
            }

            remarkEl.value = remarkText;
            remarkEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            remarkEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            
            if (window.$) {
                try {
                    window.$(remarkEl).val(remarkText).trigger('change').trigger('input');
                } catch (e) {}
            }

            const errZone = remarkEl.closest('.js_question-wrapper')?.querySelector('.js_errzone');
            if (errZone) {
                errZone.style.display = 'none';
                errZone.innerText = '';
            }

            return true;
        }

        // Submit form to get next lead
        function submitNextContact() {
            setCallOutcome("call_completed");
            setCallingRemarks(CONFIG.defaultRemark);

            const submitBtn = document.querySelector('form.js_call_campaignform button[name="button_submit"][value="finish"], button[name="button_submit"][value="finish"]');
            if (submitBtn) {
                console.log("[Ishangam Auto] Submitting form for next contact...");
                submitBtn.click();
            } else {
                const form = document.querySelector('form.js_call_campaignform');
                if (form) form.submit();
            }
        }

        // Check if current lead page loaded in Auto-Loop mode (Anti-Ban Randomized Pacing & Max Limit)
        function checkAutoLoopTrigger() {
            if (!isAutoLoopActive()) return;

            const maxLimit = getMaxMessagesLimit();
            const runSent = getRunSentCount();

            // 1. Check if Max Target Limit is reached
            if (maxLimit > 0 && runSent >= maxLimit) {
                console.log(`[Ishangam Auto] Max target reached (${runSent}/${maxLimit} sent). Halting loop.`);
                setAutoLoopState(false);
                showToast(`🎉 Target reached! Sent ${runSent}/${maxLimit} messages. Auto-loop stopped.`, "success");
                const statusDiv = document.getElementById('auto-loop-status');
                if (statusDiv) {
                    statusDiv.innerHTML = `🎯 Target reached (${runSent}/${maxLimit})`;
                    statusDiv.style.color = '#38bdf8';
                }
                updateUIState();
                return;
            }

            // 2. Anti-Ban Batch Cooldown Check (e.g., extra breather every 10 leads)
            if (CONFIG.batchSize > 0 && runSent > 0 && runSent % CONFIG.batchSize === 0 && !sessionStorage.getItem("batch_cooldown_passed")) {
                sessionStorage.setItem("batch_cooldown_passed", "true");
                console.log(`[Ishangam Auto] Batch milestone (${runSent} sent). Enforcing 3-min cooldown break...`);
                
                let breakSeconds = Math.ceil(CONFIG.batchCooldownMs / 1000);
                const statusDiv = document.getElementById('auto-loop-status');
                
                countdownTimer = setInterval(() => {
                    breakSeconds--;
                    if (statusDiv) {
                        statusDiv.innerHTML = `☕ Anti-Ban Cooldown Break (<b id="countdown-num">${formatTime(breakSeconds)}</b>)...`;
                        statusDiv.style.color = '#f97316';
                    }
                    if (breakSeconds <= 0) {
                        clearInterval(countdownTimer);
                        checkAutoLoopTrigger();
                    }
                }, 1000);
                return;
            }

            sessionStorage.removeItem("batch_cooldown_passed");

            // 3. Dynamic Randomized Delay (10 seconds to 3 minutes / 180s)
            const minSec = getMinDelaySec();
            const maxSec = getMaxDelaySec();
            const delayMs = getRandomDelay(minSec * 1000, maxSec * 1000);
            let secondsLeft = Math.ceil(delayMs / 1000);
            
            console.log(`[Ishangam Auto] Anti-Ban Random Delay: ${secondsLeft}s (${formatTime(secondsLeft)}) before next lead. [Run Progress: ${runSent}/${maxLimit || '∞'}]`);

            const statusDiv = document.getElementById('auto-loop-status');
            if (statusDiv) {
                statusDiv.innerHTML = `🟢 Sending next lead in <b id="countdown-num">${formatTime(secondsLeft)}</b> (${runSent}/${maxLimit || '∞'})`;
                statusDiv.style.color = '#4ade80';
            }

            countdownTimer = setInterval(() => {
                secondsLeft--;
                const numSpan = document.getElementById('countdown-num');
                if (numSpan) numSpan.textContent = formatTime(secondsLeft);

                if (secondsLeft <= 0) {
                    clearInterval(countdownTimer);
                    if (isAutoLoopActive()) {
                        executeWhatsAppFlow(true);
                    }
                }
            }, 1000);
        }

        function updateCounterDisplay() {
            const countDisplay = document.getElementById('sent-count-display');
            const maxLimitInput = document.getElementById('max-limit-input');
            const runSent = getRunSentCount();
            const maxLimit = getMaxMessagesLimit();

            if (countDisplay) {
                countDisplay.textContent = `${runSent} / ${maxLimit > 0 ? maxLimit : '∞'}`;
                if (maxLimit > 0 && runSent >= maxLimit) {
                    countDisplay.style.color = '#38bdf8';
                } else {
                    countDisplay.style.color = '#4ade80';
                }
            }
            if (maxLimitInput && document.activeElement !== maxLimitInput) {
                maxLimitInput.value = maxLimit;
            }
        }

        // Inject UI Widget
        function injectUIWidget() {
            if (document.getElementById('ishangam-auto-bar')) return;

            const container = document.createElement('div');
            container.id = 'ishangam-auto-bar';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                background: rgba(15, 23, 42, 0.95);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 16px;
                padding: 14px 18px;
                box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                gap: 10px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #ffffff;
                min-width: 440px;
                transition: all 0.3s ease;
            `;

            const currentLimit = getMaxMessagesLimit();
            const currentMinSec = getMinDelaySec();
            const currentMaxSec = getMaxDelaySec();
            const currentRunSent = getRunSentCount();

            container.innerHTML = `
                <!-- Top Row: Header & Status -->
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size: 20px;">🛡️</span>
                        <div>
                            <div style="font-weight: 700; font-size: 13px; letter-spacing: 0.5px; color: #4ade80;">ANTI-BAN WHATSAPP AUTO</div>
                            <div id="auto-loop-status" style="font-size: 11px; opacity: 0.85; color: #cbd5e1;">Ready</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; background: rgba(255,255,255,0.07); padding: 4px 10px; border-radius: 8px;">
                        <span style="color: #94a3b8;">Sent:</span>
                        <strong id="sent-count-display" style="color: #4ade80;">${currentRunSent} / ${currentLimit > 0 ? currentLimit : '∞'}</strong>
                        <button id="btn-reset-counter" title="Reset current run counter to 0" style="
                            background: transparent;
                            border: none;
                            color: #94a3b8;
                            cursor: pointer;
                            font-size: 13px;
                            padding: 0 2px;
                            transition: color 0.15s;
                        ">🔄</button>
                    </div>
                </div>

                <!-- Middle Row: Settings Controls (Dynamic Max Limit & Dynamic Delays) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; background: rgba(0,0,0,0.25); padding: 8px 10px; border-radius: 10px;">
                    <!-- Max Limit Setting -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="color: #94a3b8; white-space: nowrap;">🎯 Max Limit:</label>
                        <input id="max-limit-input" type="number" min="0" max="1000" value="${currentLimit}" style="
                            width: 60px;
                            background: rgba(30, 41, 59, 0.9);
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 12px;
                            font-weight: 600;
                            padding: 3px 6px;
                            text-align: center;
                            outline: none;
                        " title="Max messages to send during this run (0 = unlimited)">
                        <span style="color: #64748b; font-size: 10px;">msgs</span>
                    </div>

                    <!-- Delay Range Setting (10s to 180s) -->
                    <div style="display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                        <label style="color: #94a3b8; white-space: nowrap;">⏳ Delay:</label>
                        <input id="min-delay-input" type="number" min="5" max="600" value="${currentMinSec}" style="
                            width: 44px;
                            background: rgba(30, 41, 59, 0.9);
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 11px;
                            padding: 3px 4px;
                            text-align: center;
                            outline: none;
                        " title="Minimum delay in seconds">
                        <span style="color: #64748b;">-</span>
                        <input id="max-delay-input" type="number" min="10" max="600" value="${currentMaxSec}" style="
                            width: 44px;
                            background: rgba(30, 41, 59, 0.9);
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 11px;
                            padding: 3px 4px;
                            text-align: center;
                            outline: none;
                        " title="Maximum delay in seconds (180s = 3min)">
                        <span style="color: #64748b; font-size: 10px;">sec</span>
                    </div>
                </div>

                <!-- Bottom Row: Action Buttons -->
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="btn-toggle-loop" style="
                        flex: 1.3;
                        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                        color: white;
                        border: none;
                        padding: 9px 12px;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 12px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
                        transition: transform 0.15s ease;
                    ">
                        ▶️ Start Safe Auto Loop
                    </button>

                    <button id="btn-wa-complete" style="
                        flex: 1;
                        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                        color: white;
                        border: none;
                        padding: 9px 10px;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 12px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 4px;
                        box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25);
                        transition: transform 0.15s ease;
                    ">
                        ⚡ Send & Save
                    </button>

                    <button id="btn-wa-submit-next" style="
                        flex: 1;
                        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                        color: white;
                        border: none;
                        padding: 9px 10px;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 12px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 4px;
                        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
                        transition: transform 0.15s ease;
                    ">
                        🚀 Send & Next
                    </button>
                </div>
            `;

            document.body.appendChild(container);

            // Hook Event Listeners
            const btnToggleLoop = document.getElementById('btn-toggle-loop');
            const btnComplete = document.getElementById('btn-wa-complete');
            const btnSubmitNext = document.getElementById('btn-wa-submit-next');
            const btnResetCounter = document.getElementById('btn-reset-counter');
            const maxLimitInput = document.getElementById('max-limit-input');
            const minDelayInput = document.getElementById('min-delay-input');
            const maxDelayInput = document.getElementById('max-delay-input');

            // Max Limit Change Listener
            maxLimitInput.addEventListener('change', (e) => {
                const newLimit = setMaxMessagesLimit(e.target.value);
                showToast(`Max limit set to ${newLimit > 0 ? newLimit : 'Unlimited'}`, "info");
            });

            // Min/Max Delay Change Listeners
            minDelayInput.addEventListener('change', (e) => {
                setMinDelaySec(e.target.value);
                showToast(`Min delay set to ${getMinDelaySec()}s`, "info");
            });

            maxDelayInput.addEventListener('change', (e) => {
                setMaxDelaySec(e.target.value);
                showToast(`Max delay set to ${getMaxDelaySec()}s (${formatTime(getMaxDelaySec())})`, "info");
            });

            // Counter Reset Listener
            btnResetCounter.addEventListener('click', () => {
                resetRunSentCount();
            });

            // Loop Toggle Listener
            btnToggleLoop.addEventListener('click', () => {
                if (isAutoLoopActive()) {
                    if (countdownTimer) clearInterval(countdownTimer);
                    setAutoLoopState(false);
                    showToast("Safe Campaign Loop Paused", "warning");
                } else {
                    const limit = getMaxMessagesLimit();
                    const currentCount = getRunSentCount();
                    if (limit > 0 && currentCount >= limit) {
                        // Reset counter if starting again after reaching limit
                        resetRunSentCount();
                    }
                    setAutoLoopState(true);
                    showToast(`Anti-Ban Safe Loop Started! (Max: ${limit > 0 ? limit : '∞'}, Gap: ${getMinDelaySec()}s-${formatTime(getMaxDelaySec())})`, "success");
                    executeWhatsAppFlow(true);
                }
            });

            btnComplete.addEventListener('click', () => executeWhatsAppFlow(false));
            btnSubmitNext.addEventListener('click', () => executeWhatsAppFlow(true));

            updateUIState();
        }

        function updateUIState() {
            const active = isAutoLoopActive();
            const btnToggleLoop = document.getElementById('btn-toggle-loop');
            const statusDiv = document.getElementById('auto-loop-status');
            const maxLimit = getMaxMessagesLimit();
            const runSent = getRunSentCount();

            updateCounterDisplay();

            if (btnToggleLoop) {
                if (active) {
                    btnToggleLoop.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                    btnToggleLoop.innerHTML = '⏸️ Stop Safe Loop';
                    if (statusDiv && !statusDiv.textContent.includes('Sending') && !statusDiv.textContent.includes('Waiting') && !statusDiv.textContent.includes('Break')) {
                        statusDiv.innerHTML = `🟢 Safe Loop Active (${runSent}/${maxLimit > 0 ? maxLimit : '∞'})`;
                        statusDiv.style.color = '#4ade80';
                    }
                } else {
                    btnToggleLoop.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                    btnToggleLoop.innerHTML = `▶️ Start Safe Auto Loop (${maxLimit > 0 ? `Max: ${maxLimit}` : 'All'})`;
                    if (statusDiv && !statusDiv.textContent.includes('Target reached')) {
                        statusDiv.innerHTML = 'Paused';
                        statusDiv.style.color = '#cbd5e1';
                    }
                }
            }
        }

        function showToast(msg, type = "info") {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999999;
                background: ${type === 'success' ? '#166534' : type === 'warning' ? '#9a3412' : type === 'danger' ? '#991b1b' : '#1e40af'};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: sans-serif;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 14px rgba(0,0,0,0.25);
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.style.opacity = '1', 10);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        function init() {
            injectUIWidget();
            checkAutoLoopTrigger();
        }

        const observer = new MutationObserver(() => {
            if (!document.getElementById('ishangam-auto-bar')) {
                injectUIWidget();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        if (document.readyState === "complete" || document.readyState === "interactive") {
            init();
        } else {
            window.addEventListener("DOMContentLoaded", init);
        }
    }

    // ==========================================
    // 2. WHATSAPP WEB AUTO-SEND HELPER
    // ==========================================
    if (window.location.hostname.includes("web.whatsapp.com")) {
        console.log("[WhatsApp Web Auto] Single-Tab Helper loaded on web.whatsapp.com");

        let lastPhoneProcessed = null;
        let lastNavigatedUrl = window.location.href;
        let sendAttempted = false;

        GM_setValue(WA_TAB_ALIVE_KEY, true);

        setInterval(() => {
            GM_setValue(WA_TAB_ALIVE_KEY, true);
        }, 2000);

        window.addEventListener("beforeunload", () => {
            GM_setValue(WA_TAB_ALIVE_KEY, false);
        });

        if (typeof GM_addValueChangeListener === "function") {
            GM_addValueChangeListener(WA_NAV_URL_KEY, (name, oldVal, newVal) => {
                if (newVal && newVal !== window.location.href && newVal !== lastNavigatedUrl) {
                    console.log("[WhatsApp Web Auto] Received navigation signal:", newVal);
                    lastNavigatedUrl = newVal;
                    sendAttempted = false;
                    window.location.href = newVal;
                }
            });
        }

        setInterval(() => {
            const targetUrl = GM_getValue(WA_NAV_URL_KEY, null);
            if (targetUrl && targetUrl !== window.location.href && targetUrl !== lastNavigatedUrl) {
                lastNavigatedUrl = targetUrl;
                sendAttempted = false;
                console.log("[WhatsApp Web Auto] Polled new target URL, navigating to:", targetUrl);
                window.location.href = targetUrl;
            }
        }, 500);

        function injectStatusOverlay() {
            if (document.getElementById('wa-helper-badge')) return;
            const badge = document.createElement('div');
            badge.id = 'wa-helper-badge';
            badge.style.cssText = `
                position: fixed;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 999999;
                background: #128C7E;
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-family: sans-serif;
                font-size: 13px;
                font-weight: 600;
                box-shadow: 0 4px 14px rgba(0,0,0,0.3);
            `;
            badge.innerHTML = `🟢 Anti-Ban Safe WhatsApp Helper Active`;
            document.body.appendChild(badge);
        }

        function broadcastSignal(data) {
            GM_setValue(WA_SIGNAL_KEY, JSON.stringify(data));
            localStorage.setItem(WA_SIGNAL_KEY, JSON.stringify(data));

            const badge = document.getElementById('wa-helper-badge');
            if (badge) {
                badge.style.background = data.invalid ? '#dc2626' : '#166534';
                badge.innerHTML = data.invalid ? '⚠️ Invalid Phone Number Signal Sent!' : '✅ Delivered Signal Sent to Ishangam!';
            }
        }

        function checkAndProcessCurrentChat() {
            const urlParams = new URLSearchParams(window.location.search);
            const phone = urlParams.get('phone');

            if (phone && phone !== lastPhoneProcessed) {
                lastPhoneProcessed = phone;
                sendAttempted = false;
                console.log("[WhatsApp Web Auto] New phone target detected:", phone);

                const badge = document.getElementById('wa-helper-badge');
                if (badge) {
                    badge.style.background = '#0284c7';
                    badge.innerHTML = `⏳ Processing chat for +${phone}...`;
                }
            }

            if (sendAttempted) return;

            // Check for Invalid Number Popup Modal
            const invalidPopup = document.querySelector('div[role="dialog"]');
            if (invalidPopup && (invalidPopup.innerText.includes("invalid") || invalidPopup.innerText.includes("Phone number shared via url"))) {
                console.warn("[WhatsApp Web Auto] Invalid phone number popup detected!");
                sendAttempted = true;
                broadcastSignal({ invalid: true, sent: false, timestamp: Date.now() });
                return;
            }

            // Find Send Button
            const sendBtn = document.querySelector('button[aria-label="Send"]')
                || document.querySelector('span[data-icon="send"]')?.closest('button')
                || document.querySelector('span[data-icon="send-light"]')?.closest('button')
                || document.querySelector('span[data-icon="send"]')
                || document.querySelector('footer button[aria-label="Send"]');

            if (sendBtn) {
                console.log("[WhatsApp Web Auto] Send button detected!");
                sendAttempted = true;
                
                if (CONFIG.autoSendWhatsAppWeb) {
                    // Anti-Ban humanized typing pause before clicking Send (1.5s to 3.5s)
                    const humanPause = getRandomDelay(1500, 3500);
                    setTimeout(() => {
                        sendBtn.click();
                        console.log("[WhatsApp Web Auto] Click executed! Broadcasting GM signal...");

                        setTimeout(() => {
                            broadcastSignal({ sent: true, phone: phone, timestamp: Date.now() });
                        }, 500);
                    }, humanPause);
                } else {
                    // Semi-Auto Mode: Highlight button for manual click
                    sendBtn.style.border = "3px solid #f59e0b";
                    sendBtn.style.boxShadow = "0 0 15px #f59e0b";
                }
            }
        }

        // Listen for manual Enter key presses as alternative fallback
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                setTimeout(() => {
                    broadcastSignal({ sent: true, manual: true, timestamp: Date.now() });
                }, 400);
            }
        });

        const waObserver = new MutationObserver(() => {
            injectStatusOverlay();
            checkAndProcessCurrentChat();
        });

        waObserver.observe(document.body, { childList: true, subtree: true });

        setInterval(() => {
            injectStatusOverlay();
            checkAndProcessCurrentChat();
        }, 800);
    }

})();

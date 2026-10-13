// ==UserScript==
// @name         Ishangam Call Campaign WhatsApp Automation (Anti-Ban Safe Edition v2.3.0)
// @namespace    https://ishangam.isha.in/
// @version      2.3.0
// @description  Anti-Ban Safe WhatsApp Automation: Image Flyer Attachment (Sends Image First, then Text), Test Message Mode, Dynamic Message Limits, Human Pacing (10s to 3 min), Full Campaign & WhatsApp State Reset, Single-Tab Reuse, and Delivery Confirmation.
// @author       Antigravity
// @match        *://ishangam.isha.in/call_campaign/*
// @match        *://web.whatsapp.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
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

        // Anti-Ban Humanization Delays (10 sec to 3 min between leads)
        defaultMinDelaySec: 10,      // Minimum 10 seconds between messages
        defaultMaxDelaySec: 180,     // Maximum 3 minutes (180 seconds) between messages

        // Dynamic Max Send Limit per Run (e.g. 30)
        defaultMaxMessages: 30,      // Default limit of messages to send on a run (0 = unlimited)

        // Anti-Ban Batch Cooldowns
        batchSize: 10,               // Additional cooldown check every 10 messages if enabled
        batchCooldownMs: 180000,     // 3 minutes (180s) cooldown break between batches

        // Image & Text Inter-Message Anti-Ban Delays (in ms)
        imagePreviewPauseMinMs: 1500, // Pause while inspecting image preview before clicking Send
        imagePreviewPauseMaxMs: 2800,
        betweenImageAndTextMinMs: 2500, // Breather after image is sent before sending text message
        betweenImageAndTextMaxMs: 4000,
        textTypingPauseMinMs: 1500,  // Pause before clicking main chat Send button
        textTypingPauseMaxMs: 3200,

        maxWaWaitTimeoutMs: 75000    // 75s safety timeout for loading, attaching & sending
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

    // New v2.3.0 Storage Keys: Image, Reset, Task Info & Testing
    const IMAGE_DATA_KEY = "ishangam_campaign_image_data_gm";
    const IMAGE_ENABLED_KEY = "ishangam_campaign_image_enabled_gm";
    const WA_RESET_SIGNAL_KEY = "ishangam_wa_reset_signal_gm";
    const WA_TASK_INFO_KEY = "ishangam_wa_task_info_gm";
    const TEST_PHONE_KEY = "ishangam_test_phone_number_gm";
    const SESSION_ACTIVE_KEY = "ishangam_session_active_marker";

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

    // Helper: Convert Base64 Data URL to a native File object
    function dataURLtoFile(dataurl, filename) {
        try {
            const arr = dataurl.split(',');
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename || 'campaign_flyer.jpg', { type: mime });
        } catch (e) {
            console.error("[Ishangam Auto] Error converting data URL to file:", e);
            return null;
        }
    }

    // ==========================================
    // 1. ISHANGAM CALL CAMPAIGN AUTOMATION
    // ==========================================
    if (window.location.hostname.includes("ishangam.isha.in")) {
        console.log("[Ishangam Auto] Script loaded - Anti-Ban Safe Edition (v2.3.0)");

        let countdownTimer = null;
        let waWaitInterval = null;
        let waWaitTimeout = null;
        let listenerId = null;

        // Session initialization guard: If opening fresh session/tab, ensure loop is not accidentally active from yesterday
        if (!sessionStorage.getItem(SESSION_ACTIVE_KEY)) {
            sessionStorage.setItem(SESSION_ACTIVE_KEY, "true");
            // Set loop to false initially on fresh page load to guarantee manual user activation
            GM_setValue(AUTO_LOOP_KEY, "false");
            localStorage.setItem(AUTO_LOOP_KEY, "false");
            // Clear stale signals
            try {
                GM_deleteValue(WA_SIGNAL_KEY);
                GM_deleteValue(WA_NAV_URL_KEY);
                GM_deleteValue(WA_TASK_INFO_KEY);
                localStorage.removeItem(WA_SIGNAL_KEY);
                localStorage.removeItem(WA_NAV_URL_KEY);
            } catch (e) { }
            console.log("[Ishangam Auto] Fresh session initialized. Auto-loop set to idle state.");
        }

        function isAutoLoopActive() {
            return GM_getValue(AUTO_LOOP_KEY, "false") === "true" || localStorage.getItem(AUTO_LOOP_KEY) === "true";
        }

        function setAutoLoopState(active) {
            GM_setValue(AUTO_LOOP_KEY, active ? "true" : "false");
            localStorage.setItem(AUTO_LOOP_KEY, active ? "true" : "false");
            updateUIState();
        }

        // Lifetime Sent Count
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

        // Image Attachment Management
        function isImageAttachmentEnabled() {
            const val = GM_getValue(IMAGE_ENABLED_KEY, localStorage.getItem(IMAGE_ENABLED_KEY));
            return val === "true" || val === true;
        }

        function setImageAttachmentEnabled(enabled) {
            GM_setValue(IMAGE_ENABLED_KEY, enabled ? "true" : "false");
            localStorage.setItem(IMAGE_ENABLED_KEY, enabled ? "true" : "false");
            updateImagePreviewUI();
        }

        function getAttachedImageData() {
            try {
                const raw = GM_getValue(IMAGE_DATA_KEY, localStorage.getItem(IMAGE_DATA_KEY));
                if (!raw) return null;
                return typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch (e) {
                console.error("[Ishangam Auto] Error parsing image data:", e);
                return null;
            }
        }

        function saveAttachedImageData(dataObj) {
            const jsonStr = JSON.stringify(dataObj);
            GM_setValue(IMAGE_DATA_KEY, jsonStr);
            localStorage.setItem(IMAGE_DATA_KEY, jsonStr);
            setImageAttachmentEnabled(true);
            updateImagePreviewUI();
        }

        function clearAttachedImage() {
            try {
                GM_deleteValue(IMAGE_DATA_KEY);
                localStorage.removeItem(IMAGE_DATA_KEY);
            } catch (e) { }
            setImageAttachmentEnabled(false);
            updateImagePreviewUI();
        }

        // Process selected file: Compress/resize if needed for fast GM storage & optimal WhatsApp flyer quality
        function processAndSaveImage(file, callback) {
            if (!file || !file.type.startsWith("image/")) {
                showToast("⚠️ Please select a valid image file (JPG, PNG, WebP)!", "warning");
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    // Maximum 1400px on long edge is ideal for flyers & keeps storage small (~150-300KB)
                    const maxDim = 1400;
                    let width = img.width;
                    let height = img.height;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
                    const sizeKB = Math.round((compressedDataUrl.length * 3) / 4 / 1024);

                    const dataObj = {
                        dataUrl: compressedDataUrl,
                        name: file.name,
                        sizeKB: sizeKB,
                        type: 'image/jpeg',
                        width: width,
                        height: height,
                        timestamp: Date.now()
                    };

                    saveAttachedImageData(dataObj);
                    if (callback) callback(dataObj);
                };
                img.onerror = function () {
                    showToast("❌ Failed to parse image file.", "danger");
                };
                img.src = e.target.result;
            };
            reader.onerror = function () {
                showToast("❌ Error reading selected file.", "danger");
            };
            reader.readAsDataURL(file);
        }

        // Comprehensive Campaign & WhatsApp State Reset:
        // Clears counters, timers, loop state, signals, and commands WhatsApp Web tab to reset its processing state
        function resetCampaignState(interactive = true) {
            if (interactive && isAutoLoopActive()) {
                const confirmed = window.confirm("A campaign loop is currently active.\nDo you want to stop it and completely reset the campaign state?");
                if (!confirmed) return false;
            }

            // 1. Clear active countdown & listeners
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
            cleanupListeners();

            // 2. Stop auto loop
            GM_setValue(AUTO_LOOP_KEY, "false");
            localStorage.setItem(AUTO_LOOP_KEY, "false");

            // 3. Clear run counter & session count
            localStorage.setItem(RUN_SENT_COUNT_KEY, "0");
            GM_setValue(RUN_SENT_COUNT_KEY, "0");
            localStorage.setItem(MSG_COUNT_KEY, "0");
            GM_setValue(MSG_COUNT_KEY, "0");

            // 4. Clear batch cooldown session state
            sessionStorage.removeItem("batch_cooldown_passed");

            // 5. Clear pending cross-tab signals & tasks
            try {
                GM_deleteValue(WA_SIGNAL_KEY);
                GM_deleteValue(WA_NAV_URL_KEY);
                GM_deleteValue(WA_TASK_INFO_KEY);
                localStorage.removeItem(WA_SIGNAL_KEY);
                localStorage.removeItem(WA_NAV_URL_KEY);
                localStorage.removeItem(WA_TASK_INFO_KEY);
            } catch (e) { }

            // 6. Broadcast Reset Signal to WhatsApp Web tab
            const resetTimestamp = Date.now();
            GM_setValue(WA_RESET_SIGNAL_KEY, resetTimestamp.toString());
            localStorage.setItem(WA_RESET_SIGNAL_KEY, resetTimestamp.toString());
            console.log("[Ishangam Auto] Broadcasted reset signal to WhatsApp Web tab at:", resetTimestamp);

            // 7. Update UI
            updateCounterDisplay();
            updateUIState();

            const statusDiv = document.getElementById('auto-loop-status');
            if (statusDiv) {
                statusDiv.innerHTML = "✨ Fresh State (Cleared)";
                statusDiv.style.color = "#38bdf8";
            }

            if (interactive) {
                showToast("🔄 Campaign & WhatsApp states cleared! Old data wiped clean.", "success");
            }
            return true;
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

        // Saved Test Phone Number Getter & Setter
        function getSavedTestPhone() {
            return GM_getValue(TEST_PHONE_KEY, localStorage.getItem(TEST_PHONE_KEY) || "");
        }

        function setSavedTestPhone(phone) {
            GM_setValue(TEST_PHONE_KEY, phone);
            localStorage.setItem(TEST_PHONE_KEY, phone);
        }

        function cleanupListeners() {
            if (listenerId && typeof GM_removeValueChangeListener === "function") {
                try { GM_removeValueChangeListener(listenerId); } catch (e) { }
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

        // Main Action: Reuses WhatsApp Web tab via GM signal, sends Image first (if attached) then Text,
        // waits for delivery, then marks Complete & Submits to get next lead
        function executeWhatsAppFlow(autoSubmit = false, isTest = false, customTestPhone = null) {
            try {
                // Safety check: before sending normal lead, verify if limit is already hit
                if (!isTest) {
                    const maxLimit = getMaxMessagesLimit();
                    const runSent = getRunSentCount();
                    if (maxLimit > 0 && runSent >= maxLimit && isAutoLoopActive()) {
                        console.log(`[Ishangam Auto] Max limit already reached (${runSent}/${maxLimit}).`);
                        setAutoLoopState(false);
                        showToast(`🎯 Target limit reached (${runSent}/${maxLimit})! Loop stopped.`, "success");
                        return;
                    }
                }

                // Delete old signal before sending new message
                GM_deleteValue(WA_SIGNAL_KEY);

                let waUrl = getWhatsAppUrl();
                let phone = null;
                let messageText = "";

                if (isTest && customTestPhone) {
                    // Testing on custom phone number
                    phone = customTestPhone.replace(/[^\d]/g, '');
                    if (phone.length === 10) phone = "91" + phone; // Default to India prefix if 10 digits
                    const contactName = "Test Lead";
                    messageText = getLeadMessageText() || "Namaskaram! 🙏\n\nThis is a test message from Ishangam WhatsApp Automation.";
                    messageText = formatPersonalizedGreeting(messageText, contactName);
                } else {
                    // Current lead on Ishangam page
                    if (!waUrl) {
                        showToast("❌ WhatsApp URL not found for this lead!", "danger");
                        if (!isTest) setAutoLoopState(false);
                        return;
                    }

                    try {
                        const urlObj = new URL(waUrl);
                        phone = urlObj.searchParams.get("phone");
                        messageText = urlObj.searchParams.get("text") || "";
                    } catch (e) {
                        phone = getLeadPhone();
                    }

                    const contactName = getContactName();
                    if (contactName && messageText) {
                        messageText = formatPersonalizedGreeting(messageText, contactName);
                    }
                }

                if (!phone) {
                    showToast("❌ Phone number could not be determined!", "danger");
                    if (!isTest) setAutoLoopState(false);
                    return;
                }

                // Check Image Attachment
                const hasImageAttachment = isImageAttachmentEnabled() && Boolean(getAttachedImageData());

                // Package Task Info for WhatsApp Web tab
                const taskInfo = {
                    phone: phone,
                    text: messageText,
                    sendImage: hasImageAttachment,
                    isTest: Boolean(isTest),
                    contactName: isTest ? "Test Lead" : (getContactName() || ""),
                    taskId: "task_" + Date.now(),
                    timestamp: Date.now()
                };

                const taskJson = JSON.stringify(taskInfo);
                GM_setValue(WA_TASK_INFO_KEY, taskJson);
                localStorage.setItem(WA_TASK_INFO_KEY, taskJson);

                // Build WhatsApp Web URL
                const targetUrl = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(messageText)}&autoSend=1`;

                const statusDiv = document.getElementById('auto-loop-status');
                if (statusDiv) {
                    statusDiv.innerHTML = isTest
                        ? `🧪 Sending Test (${hasImageAttachment ? 'Image + Text' : 'Text'})...`
                        : `⏳ Sending (${hasImageAttachment ? 'Image + Text' : 'Text'})...`;
                    statusDiv.style.color = '#fde047';
                }

                // Check if WhatsApp tab is already open and alive
                const isTabAlive = GM_getValue(WA_TAB_ALIVE_KEY, false);

                if (isTabAlive) {
                    console.log(`[Ishangam Auto] Navigating in existing WhatsApp tab for +${phone}...`);
                    showToast(isTest ? "🧪 Sending test to WhatsApp Web tab..." : "Navigating in existing WhatsApp tab...", "info");
                    GM_setValue(WA_NAV_URL_KEY, targetUrl);
                } else {
                    console.log(`[Ishangam Auto] Opening initial WhatsApp Web tab for +${phone}...`);
                    showToast(isTest ? "🧪 Opening WhatsApp Web for test..." : "Opening initial WhatsApp Web tab...", "info");
                    const waWin = window.open(targetUrl, 'ishangam_whatsapp_single_tab');
                    if (waWin) waWin.focus();
                }

                // Start Handshake Listener: Wait for GM_setValue signal from web.whatsapp.com
                listenForSendConfirmation((result) => {
                    if (result && result.invalid) {
                        console.warn("[Ishangam Auto] Invalid WhatsApp number detected!");
                        if (isTest) {
                            showToast(`⚠️ Test failed: Invalid WhatsApp Number (+${phone})!`, "warning");
                            if (statusDiv) {
                                statusDiv.innerHTML = "⚠️ Test: Invalid Number";
                                statusDiv.style.color = "#f97316";
                            }
                        } else {
                            showToast("⚠️ Invalid WhatsApp Number! Marked Invalid in CRM.", "warning");
                            setCallOutcome("invalid_number");
                            setCallingRemarks("invalid number");

                            if (autoSubmit || isAutoLoopActive()) {
                                if (statusDiv) statusDiv.innerHTML = `⚠️ Invalid! Loading next lead...`;
                                setTimeout(() => submitNextContact(), 1200);
                            }
                        }
                        return;
                    }

                    // Successful send
                    if (isTest) {
                        console.log(`[Ishangam Auto] Test message confirmed for +${phone}!`);
                        showToast(`🧪 Test message sent successfully to +${phone}! Review in WhatsApp Web.`, "success");
                        if (statusDiv) {
                            statusDiv.innerHTML = "✅ Test Message Sent!";
                            statusDiv.style.color = "#4ade80";
                        }
                        return; // Do NOT submit form or increment campaign counters for test!
                    }

                    // Normal Campaign Lead Success
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

                    // Submit & Get Next lead if autoSubmit is enabled
                    if (autoSubmit || isAutoLoopActive()) {
                        if (statusDiv) statusDiv.innerHTML = `✅ Confirmed! Loading next lead...`;
                        setTimeout(() => {
                            submitNextContact();
                        }, 900);
                    }
                });

            } catch (err) {
                console.error("[Ishangam Auto] Error executing workflow:", err);
                showToast("Error: " + err.message, "danger");
                if (!isTest) setAutoLoopState(false);
            }
        }

        // Extract lead's name from page
        function getContactName() {
            const h1El = document.querySelector('h1.d-inline-block, .card-header h1, h1');
            if (h1El) {
                return h1El.innerText.trim();
            }
            return null;
        }

        // Clean and personalize message greeting (avoids duplicate blank lines and stray commas)
        function formatPersonalizedGreeting(originalText, contactName) {
            if (!originalText) return "";
            const name = (contactName || "").trim();
            if (!name) return originalText;

            // Check if already personalized with this exact contact name
            if (originalText.startsWith("Namaskaram " + name)) {
                return originalText;
            }

            // Strip existing "Namaskaram" along with any trailing punctuation (commas, exclamation marks, colons, dashes),
            // emojis (hands 🙏, flower 🌸, etc.), and any trailing whitespace or newlines.
            let body = originalText.replace(/^Namaskaram[\s,!;:🙏🌸\u{1F64F}\u{1F338}\-]*/iu, '');

            // Also strip any leftover commas, quotes, dashes, or blank lines before the body text starts
            body = body.replace(/^[\s,!;:.'"\-]+/u, '');

            // Return clean greeting followed by exactly ONE empty line (\n\n) before the body
            return `Namaskaram ${name}! 🙏\n\n${body}`;
        }

        // Extract phone number text directly from header or links
        function getLeadPhone() {
            const phoneEl = document.querySelector('.partner_phone, a[href^="tel:"]');
            if (phoneEl) {
                return phoneEl.innerText.replace(/[^\d]/g, '');
            }
            return null;
        }

        // Extract template message text from partner_whatsapp link
        function getLeadMessageText() {
            const waUrl = getWhatsAppUrl();
            if (waUrl) {
                try {
                    const u = new URL(waUrl);
                    return u.searchParams.get("text") || "";
                } catch (e) { }
            }
            return "";
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

            // Safety Timeout
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
                } catch (e) { }
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
                } catch (e) { }
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

        function updateImagePreviewUI() {
            const imgData = getAttachedImageData();
            const isEnabled = isImageAttachmentEnabled();
            const toggleCb = document.getElementById('cb-attach-image');
            const previewCard = document.getElementById('image-preview-card');
            const noImageHint = document.getElementById('no-image-hint');
            const thumbImg = document.getElementById('image-thumbnail-img');
            const nameSpan = document.getElementById('image-name-span');
            const sizeSpan = document.getElementById('image-size-span');

            if (toggleCb) {
                toggleCb.checked = Boolean(isEnabled && imgData);
                toggleCb.disabled = !imgData;
            }

            if (imgData) {
                if (previewCard) previewCard.style.display = 'flex';
                if (noImageHint) noImageHint.style.display = 'none';
                if (thumbImg) thumbImg.src = imgData.dataUrl;
                if (nameSpan) nameSpan.textContent = imgData.name || 'campaign_flyer.jpg';
                if (sizeSpan) sizeSpan.textContent = `${imgData.sizeKB || '~200'} KB`;
            } else {
                if (previewCard) previewCard.style.display = 'none';
                if (noImageHint) noImageHint.style.display = 'block';
            }
        }

        // Inject UI Widget
        function injectUIWidget() {
            if (document.getElementById('ishangam-auto-bar')) return;

            const container = document.createElement('div');
            container.id = 'ishangam-auto-bar';
            container.style.cssText = `
                position: fixed;
                bottom: 16px;
                right: 16px;
                z-index: 999999;
                background: rgba(15, 23, 42, 0.96);
                backdrop-filter: blur(14px);
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 16px;
                padding: 14px 18px;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
                display: flex;
                flex-direction: column;
                gap: 10px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #ffffff;
                width: 460px;
                box-sizing: border-box;
                transition: all 0.3s ease;
            `;

            const currentLimit = getMaxMessagesLimit();
            const currentMinSec = getMinDelaySec();
            const currentMaxSec = getMaxDelaySec();
            const currentRunSent = getRunSentCount();
            const savedTestPhone = getSavedTestPhone();
            const currentLeadName = getContactName() || "Current Lead";
            const currentLeadPhone = getLeadPhone() || "";

            container.innerHTML = `
                <!-- Top Row: Header & Badges & Reset -->
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size: 20px;">🛡️</span>
                        <div>
                            <div style="font-weight: 700; font-size: 13px; letter-spacing: 0.5px; color: #4ade80;">ANTI-BAN WHATSAPP AUTO v2.3.0</div>
                            <div id="auto-loop-status" style="font-size: 11px; opacity: 0.85; color: #cbd5e1;">Ready (Fresh Campaign)</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; background: rgba(255,255,255,0.08); padding: 4px 10px; border-radius: 8px;">
                            <span style="color: #94a3b8;">Sent:</span>
                            <strong id="sent-count-display" style="color: #4ade80;">${currentRunSent} / ${currentLimit > 0 ? currentLimit : '∞'}</strong>
                        </div>
                        <button id="btn-reset-campaign" title="Clear all previous campaign run counters, timers, and signals to start fresh" style="
                            background: rgba(239, 68, 68, 0.22);
                            border: 1px solid rgba(239, 68, 68, 0.5);
                            color: #fca5a5;
                            border-radius: 8px;
                            padding: 4px 10px;
                            font-size: 11px;
                            font-weight: 700;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            box-shadow: 0 2px 6px rgba(239, 68, 68, 0.2);
                            transition: all 0.2s ease;
                        ">
                            🔄 Reset State
                        </button>
                    </div>
                </div>

                <!-- Image Attachment Section (Flyer First, then Text) -->
                <div style="background: rgba(30, 41, 59, 0.65); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; user-select: none;">
                            <input type="checkbox" id="cb-attach-image" style="cursor: pointer; accent-color: #10b981;">
                            <span style="font-weight: 600; color: #e2e8f0;">📸 Attach Image Flyer</span>
                            <span style="color: #94a3b8; font-size: 10px;">(Sends Image first ➔ then Text)</span>
                        </label>
                        <label for="file-upload-input" style="
                            background: rgba(56, 189, 248, 0.2);
                            border: 1px solid rgba(56, 189, 248, 0.4);
                            color: #7dd3fc;
                            font-size: 11px;
                            font-weight: 600;
                            padding: 3px 8px;
                            border-radius: 6px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            transition: all 0.2s;
                        ">
                            📎 Select Image
                            <input type="file" id="file-upload-input" accept="image/png, image/jpeg, image/webp" style="display: none;">
                        </label>
                    </div>

                    <!-- Image Thumbnail Preview Card -->
                    <div id="image-preview-card" style="display: none; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.7); border-radius: 8px; padding: 4px 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <img id="image-thumbnail-img" style="width: 32px; height: 32px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);" />
                            <div style="font-size: 11px; line-height: 1.2;">
                                <div id="image-name-span" style="color: #f8fafc; font-weight: 500; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">flyer.jpg</div>
                                <div id="image-size-span" style="color: #94a3b8; font-size: 10px;">~200 KB</div>
                            </div>
                        </div>
                        <button id="btn-remove-image" title="Remove attached image (Text only)" style="
                            background: transparent;
                            border: none;
                            color: #ef4444;
                            font-size: 14px;
                            cursor: pointer;
                            padding: 2px 6px;
                        ">✕</button>
                    </div>
                    <div id="no-image-hint" style="font-size: 10px; color: #64748b; font-style: italic;">
                        No flyer attached (Text message only). Click "📎 Select Image" to attach yoga flyer/poster.
                    </div>
                </div>

                <!-- Middle Row: Settings Controls (Dynamic Max Limit & Dynamic Delays) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; background: rgba(0,0,0,0.25); padding: 7px 10px; border-radius: 10px;">
                    <!-- Max Limit Setting -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="color: #94a3b8; white-space: nowrap;">🎯 Max Limit:</label>
                        <input id="max-limit-input" type="number" min="0" max="1000" value="${currentLimit}" style="
                            width: 58px;
                            background: rgba(30, 41, 59, 0.9);
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 12px;
                            font-weight: 600;
                            padding: 2px 6px;
                            text-align: center;
                            outline: none;
                        " title="Max messages to send during this run (0 = unlimited)">
                        <span style="color: #64748b; font-size: 10px;">msgs</span>
                    </div>

                    <!-- Delay Range Setting (10s to 180s) -->
                    <div style="display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                        <label style="color: #94a3b8; white-space: nowrap;">⏳ Delay:</label>
                        <input id="min-delay-input" type="number" min="5" max="600" value="${currentMinSec}" style="
                            width: 40px;
                            background: rgba(30, 41, 59, 0.9);
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 11px;
                            padding: 2px 4px;
                            text-align: center;
                            outline: none;
                        " title="Minimum delay in seconds">
                        <span style="color: #64748b;">-</span>
                        <input id="max-delay-input" type="number" min="10" max="600" value="${currentMaxSec}" style="
                            width: 40px;
                            background: rgba(30, 41, 59, 0.9);
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 11px;
                            padding: 2px 4px;
                            text-align: center;
                            outline: none;
                        " title="Maximum delay in seconds (180s = 3min)">
                        <span style="color: #64748b; font-size: 10px;">sec</span>
                    </div>
                </div>

                <!-- Test Message Drawer (Collapsible) -->
                <div id="test-message-drawer" style="display: none; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 10px; padding: 8px 10px; font-size: 11px; flex-direction: column; gap: 6px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-weight: 700; color: #93c5fd;">🧪 Test WhatsApp Message</span>
                        <span style="font-size: 10px; color: #cbd5e1;">(Will NOT mark CRM or advance lead)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="text" id="test-phone-input" placeholder="Custom Phone (e.g. 9886373307)" value="${savedTestPhone || currentLeadPhone}" style="
                            flex: 1;
                            background: rgba(15, 23, 42, 0.9);
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 11px;
                            padding: 4px 8px;
                            outline: none;
                        ">
                        <button id="btn-fire-test" style="
                            background: #2563eb;
                            border: none;
                            color: white;
                            font-weight: 600;
                            border-radius: 6px;
                            padding: 4px 10px;
                            font-size: 11px;
                            cursor: pointer;
                            white-space: nowrap;
                        ">⚡ Send Test</button>
                    </div>
                </div>

                <!-- Bottom Row: Primary Action Buttons -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button id="btn-toggle-loop" style="
                        flex: 1.4;
                        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
                        gap: 5px;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
                        transition: transform 0.15s ease;
                    ">
                        ▶️ Start Safe Auto Loop
                    </button>

                    <button id="btn-open-test-drawer" title="Send a single test message with attached flyer to check format" style="
                        background: rgba(59, 130, 246, 0.2);
                        border: 1px solid rgba(59, 130, 246, 0.5);
                        color: #93c5fd;
                        padding: 9px 10px;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 11px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    ">
                        🧪 Test
                    </button>

                    <button id="btn-wa-complete" style="
                        flex: 1;
                        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                        color: white;
                        border: none;
                        padding: 9px 8px;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 11px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 4px;
                        box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25);
                    ">
                        ⚡ Send & Save
                    </button>

                    <button id="btn-wa-submit-next" style="
                        flex: 1;
                        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                        color: white;
                        border: none;
                        padding: 9px 8px;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 11px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 4px;
                        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
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
            const btnResetCampaign = document.getElementById('btn-reset-campaign');
            const maxLimitInput = document.getElementById('max-limit-input');
            const minDelayInput = document.getElementById('min-delay-input');
            const maxDelayInput = document.getElementById('max-delay-input');

            // Image Element Listeners
            const fileUploadInput = document.getElementById('file-upload-input');
            const cbAttachImage = document.getElementById('cb-attach-image');
            const btnRemoveImage = document.getElementById('btn-remove-image');

            // Test Drawer Listeners
            const btnOpenTestDrawer = document.getElementById('btn-open-test-drawer');
            const testDrawer = document.getElementById('test-message-drawer');
            const testPhoneInput = document.getElementById('test-phone-input');
            const btnFireTest = document.getElementById('btn-fire-test');

            // Image Upload Event
            fileUploadInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    processAndSaveImage(e.target.files[0], (data) => {
                        showToast(`📸 Attached flyer "${data.name}" (${data.sizeKB} KB)!`, "success");
                    });
                }
            });

            // Image Toggle Checkbox Event
            cbAttachImage.addEventListener('change', (e) => {
                setImageAttachmentEnabled(e.target.checked);
                showToast(e.target.checked ? "📸 Image attachment enabled (Sends Image first, then Text)" : "Image attachment disabled (Text only)", "info");
            });

            // Remove Image Button
            btnRemoveImage.addEventListener('click', () => {
                clearAttachedImage();
                showToast("🗑️ Attached image removed (reverted to text-only)", "info");
            });

            // Toggle Test Drawer
            btnOpenTestDrawer.addEventListener('click', () => {
                const isHidden = testDrawer.style.display === 'none';
                testDrawer.style.display = isHidden ? 'flex' : 'none';
                btnOpenTestDrawer.style.background = isHidden ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.2)';
            });

            // Fire Test Message Button
            btnFireTest.addEventListener('click', () => {
                const targetPhone = testPhoneInput.value.trim();
                if (!targetPhone) {
                    showToast("⚠️ Please enter a phone number for the test!", "warning");
                    testPhoneInput.focus();
                    return;
                }
                setSavedTestPhone(targetPhone);
                executeWhatsAppFlow(false, true, targetPhone);
            });

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

            // Campaign State Reset Listener
            if (btnResetCampaign) {
                btnResetCampaign.addEventListener('mouseenter', () => {
                    btnResetCampaign.style.background = 'rgba(239, 68, 68, 0.35)';
                    btnResetCampaign.style.borderColor = 'rgba(239, 68, 68, 0.7)';
                    btnResetCampaign.style.transform = 'translateY(-1px)';
                });
                btnResetCampaign.addEventListener('mouseleave', () => {
                    btnResetCampaign.style.background = 'rgba(239, 68, 68, 0.22)';
                    btnResetCampaign.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                    btnResetCampaign.style.transform = 'translateY(0)';
                });
                btnResetCampaign.addEventListener('click', () => {
                    resetCampaignState(true);
                });
            }

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
                        // Reset campaign state if starting again after reaching limit
                        resetCampaignState(false);
                    }
                    setAutoLoopState(true);
                    const withImage = isImageAttachmentEnabled() && getAttachedImageData();
                    showToast(`Anti-Ban Safe Loop Started! (${withImage ? 'Image + Text' : 'Text Only'}, Max: ${limit > 0 ? limit : '∞'}, Gap: ${getMinDelaySec()}s-${formatTime(getMaxDelaySec())})`, "success");
                    executeWhatsAppFlow(true);
                }
            });

            btnComplete.addEventListener('click', () => executeWhatsAppFlow(false));
            btnSubmitNext.addEventListener('click', () => executeWhatsAppFlow(true));

            updateImagePreviewUI();
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
                    if (statusDiv && !statusDiv.textContent.includes('Target reached') && !statusDiv.textContent.includes('Fresh State') && !statusDiv.textContent.includes('Test')) {
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
        console.log("[WhatsApp Web Auto] Single-Tab Helper loaded on web.whatsapp.com (v2.3.0)");

        let lastPhoneProcessed = null;
        let lastNavigatedUrl = window.location.href;
        let sendAttempted = false;
        let isProcessingImage = false;

        GM_setValue(WA_TAB_ALIVE_KEY, true);

        // Heartbeat keepalive signal
        setInterval(() => {
            GM_setValue(WA_TAB_ALIVE_KEY, true);
        }, 2000);

        window.addEventListener("beforeunload", () => {
            GM_setValue(WA_TAB_ALIVE_KEY, false);
        });

        // WhatsApp Web State Reset Handler
        function handleResetSignal() {
            console.log("[WhatsApp Web Auto] Received Reset Signal! Clearing internal state...");
            lastPhoneProcessed = null;
            sendAttempted = false;
            isProcessingImage = false;
            lastNavigatedUrl = window.location.href;

            // Close any open invalid popup modal if visible
            const modalCloseBtn = document.querySelector('div[role="dialog"] button');
            if (modalCloseBtn) {
                try { modalCloseBtn.click(); } catch (e) { }
            }

            const badge = document.getElementById('wa-helper-badge');
            if (badge) {
                badge.style.background = '#6366f1';
                badge.innerHTML = `✨ State Cleared - Ready for New Campaign`;
            }
        }

        // Listen for Reset Signal from Ishangam
        if (typeof GM_addValueChangeListener === "function") {
            GM_addValueChangeListener(WA_RESET_SIGNAL_KEY, (name, oldVal, newVal) => {
                if (newVal) handleResetSignal();
            });
        }

        let lastSeenResetVal = GM_getValue(WA_RESET_SIGNAL_KEY, null);
        setInterval(() => {
            const currentResetVal = GM_getValue(WA_RESET_SIGNAL_KEY, null);
            if (currentResetVal && currentResetVal !== lastSeenResetVal) {
                lastSeenResetVal = currentResetVal;
                handleResetSignal();
            }
        }, 600);

        // Navigation Signal Listener
        if (typeof GM_addValueChangeListener === "function") {
            GM_addValueChangeListener(WA_NAV_URL_KEY, (name, oldVal, newVal) => {
                if (newVal && newVal !== window.location.href && newVal !== lastNavigatedUrl) {
                    console.log("[WhatsApp Web Auto] Received navigation signal:", newVal);
                    lastNavigatedUrl = newVal;
                    sendAttempted = false;
                    isProcessingImage = false;
                    window.location.href = newVal;
                }
            });
        }

        setInterval(() => {
            const targetUrl = GM_getValue(WA_NAV_URL_KEY, null);
            if (targetUrl && targetUrl !== window.location.href && targetUrl !== lastNavigatedUrl) {
                lastNavigatedUrl = targetUrl;
                sendAttempted = false;
                isProcessingImage = false;
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
                padding: 7px 16px;
                border-radius: 20px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                font-weight: 600;
                box-shadow: 0 4px 14px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            badge.innerHTML = `
                <span>🟢 Anti-Ban Safe WhatsApp Helper Active</span>
                <button id="wa-btn-clear-state" title="Manually clear state" style="
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: white;
                    padding: 2px 7px;
                    border-radius: 10px;
                    font-size: 10px;
                    font-weight: 700;
                    cursor: pointer;
                ">🔄 Clear</button>
            `;
            document.body.appendChild(badge);

            const btnClear = document.getElementById('wa-btn-clear-state');
            if (btnClear) {
                btnClear.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleResetSignal();
                });
            }
        }

        function broadcastSignal(data) {
            GM_setValue(WA_SIGNAL_KEY, JSON.stringify(data));
            localStorage.setItem(WA_SIGNAL_KEY, JSON.stringify(data));

            const badge = document.getElementById('wa-helper-badge');
            if (badge) {
                badge.style.background = data.invalid ? '#dc2626' : '#166534';
                badge.innerHTML = data.invalid
                    ? '⚠️ Invalid Phone Number Signal Sent!'
                    : (data.test ? '🧪 Test Message Delivered to Ishangam!' : '✅ Delivered Signal Sent to Ishangam!');
            }
        }

        // WhatsApp Web DOM Helpers
        function getChatInput() {
            return document.querySelector('#main footer div[contenteditable="true"]')
                || document.querySelector('footer div[contenteditable="true"]')
                || document.querySelector('div[contenteditable="true"][data-tab="10"]')
                || document.querySelector('div[contenteditable="true"][data-tab="6"]');
        }

        function getMainSendButton() {
            // 1. WDS icon in footer or main
            const wdsIcon = document.querySelector('#main footer span[data-icon="wds-ic-send-filled"], footer span[data-icon="wds-ic-send-filled"], span[data-icon="wds-ic-send-filled"], span[data-testid="wds-ic-send-filled"]');
            if (wdsIcon) {
                return wdsIcon.closest('[role="button"]') || wdsIcon.closest('button') || wdsIcon;
            }

            // 2. Aria-label starting with Send in footer
            const ariaBtn = document.querySelector('#main footer div[role="button"][aria-label^="Send"], footer div[role="button"][aria-label^="Send"], footer button[aria-label^="Send"]');
            if (ariaBtn) return ariaBtn;

            // 3. SVG path matcher in footer for WhatsApp send airplane icon
            const footerSvg = document.querySelector('footer svg path[d*="M5.4 19.43"], #main footer svg path[d*="M5.4 19.43"]');
            if (footerSvg) {
                return footerSvg.closest('[role="button"]') || footerSvg.closest('button');
            }

            // 4. Classic data-icon="send"
            const classicIcon = document.querySelector('footer span[data-icon="send"], footer span[data-icon="send-light"], span[data-icon="send"]');
            if (classicIcon) {
                return classicIcon.closest('[role="button"]') || classicIcon.closest('button') || classicIcon;
            }

            return null;
        }

        function isMediaPreviewOpen() {
            return Boolean(
                document.querySelector('span[data-icon="wds-ic-send-filled"]')
                || document.querySelector('div[role="button"][aria-label^="Send 1 selected"]')
                || document.querySelector('div[role="button"][aria-label*="selected"]')
                || document.querySelector('div[data-animate-media-viewer="true"]')
                || document.querySelector('div[data-testid="media-editor-viewer"]')
                || document.querySelector('div[aria-label*="Preview"]')
                || document.querySelector('div[data-testid="media-caption-dialog"]')
                || document.querySelector('div[role="region"][aria-label*="Media"]')
            );
        }

        // Ensure caption in media editor contains the personalized message
        function ensureMediaCaptionHasText(text) {
            if (!text) return;
            const editables = document.querySelectorAll('div[contenteditable="true"]');
            if (editables.length === 0) return;
            // The active caption editor in media preview is the last contenteditable element in the DOM
            const captionEl = editables[editables.length - 1];

            const currentText = (captionEl.innerText || captionEl.textContent || "").trim();
            if (currentText.length === 0) {
                console.log("[WhatsApp Web Auto] Caption was empty; populating with personalized message...");
                try {
                    captionEl.focus();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(captionEl);
                    selection.removeAllRanges();
                    selection.addRange(range);

                    const success = document.execCommand('insertText', false, text);
                    if (!success) {
                        captionEl.innerText = text;
                    }
                    captionEl.dispatchEvent(new Event('input', { bubbles: true }));
                    captionEl.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) {
                    console.error("[WhatsApp Web Auto] Error populating caption:", e);
                }
            } else {
                console.log("[WhatsApp Web Auto] Caption already contains text:", currentText.substring(0, 30) + "...");
            }
        }

        function getMediaSendButton() {
            // 1. Direct WDS icon match (from WhatsApp Design System inspect element)
            const wdsIcon = document.querySelector('span[data-icon="wds-ic-send-filled"], span[data-testid="wds-ic-send-filled"]');
            if (wdsIcon) {
                return wdsIcon.closest('[role="button"]') || wdsIcon.closest('button') || wdsIcon;
            }

            // 2. Exact or prefix aria-label match on role="button" or button (e.g. "Send 1 selected")
            const ariaBtn = document.querySelector('div[role="button"][aria-label^="Send"], div[role="button"][aria-label*="selected"], button[aria-label^="Send"]');
            if (ariaBtn) {
                return ariaBtn;
            }

            // 3. SVG Path definition for WhatsApp paper airplane send icon (d starts with M5.4 19.43)
            const sendSvgPath = document.querySelector('svg path[d*="M5.4 19.43"]');
            if (sendSvgPath) {
                return sendSvgPath.closest('[role="button"]') || sendSvgPath.closest('button');
            }

            // 4. Search within media preview container
            const mediaContainer = document.querySelector('div[data-animate-media-viewer="true"]')
                || document.querySelector('div[data-testid="media-editor-viewer"]')
                || document.querySelector('div[aria-label*="Preview"]')
                || document.querySelector('div[data-testid="media-caption-dialog"]')
                || document.body;

            const btnInMedia = mediaContainer.querySelector('div[role="button"][aria-label^="Send"]')
                || mediaContainer.querySelector('div[role="button"][aria-label*="selected"]')
                || mediaContainer.querySelector('span[data-icon="wds-ic-send-filled"]')?.closest('[role="button"]')
                || mediaContainer.querySelector('span[data-icon="send"]')?.closest('[role="button"]')
                || mediaContainer.querySelector('span[data-icon="send"]')?.closest('button')
                || mediaContainer.querySelector('button[aria-label^="Send"]');

            if (btnInMedia) return btnInMedia;

            return null;
        }

        // Comprehensive Click Dispatcher for React / WhatsApp Web DOM
        function clickElementThoroughly(el) {
            if (!el) return false;
            const btn = el.closest('[role="button"]') || el.closest('button') || el;

            try { btn.focus(); } catch (e) { }

            // Full mouse / pointer event sequence to trigger React SyntheticEvent listeners
            const eventSequence = ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
            eventSequence.forEach(evtType => {
                try {
                    const ev = new MouseEvent(evtType, {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        buttons: 1
                    });
                    btn.dispatchEvent(ev);
                } catch (e) { }
            });

            try {
                btn.click();
            } catch (e) { }

            // Also trigger on inner span / svg
            try {
                const inner = btn.querySelector('span[data-icon], span[data-testid], svg');
                if (inner) {
                    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    inner.click();
                }
            } catch (e) { }

            return true;
        }

        // Wait for Media Send button to be rendered and enabled
        function waitForMediaSendButton(callback, maxWaitMs = 10000) {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const btn = getMediaSendButton();
                const isDisabled = btn && (btn.getAttribute('aria-disabled') === 'true' || btn.disabled);
                if (btn && !isDisabled) {
                    clearInterval(interval);
                    callback(btn);
                    return;
                }
                if (Date.now() - startTime > maxWaitMs) {
                    clearInterval(interval);
                    callback(btn);
                }
            }, 300);
        }

        function insertTextIntoChat(text) {
            const input = getChatInput();
            if (!input || !text) return false;
            try {
                input.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(input);
                selection.removeAllRanges();
                selection.addRange(range);

                const success = document.execCommand('insertText', false, text);
                if (!success) {
                    input.innerText = text;
                }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            } catch (e) {
                console.error("[WhatsApp Web Auto] Error inserting text:", e);
                return false;
            }
        }

        // Attach Image: Dispatches synthetic Paste event with DataTransfer, with fallback to hidden file input
        function attachImageFlyer(file, onPreviewOpened) {
            if (!file) return;

            const dt = new DataTransfer();
            dt.items.add(file);

            const chatInput = getChatInput();
            const target = chatInput || document.querySelector('#main') || document.body;

            console.log("[WhatsApp Web Auto] Dispatching synthetic paste event for image flyer...");
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt
            });
            target.dispatchEvent(pasteEvent);

            // Wait 1.2s to check if media viewer opened via paste
            setTimeout(() => {
                if (isMediaPreviewOpen()) {
                    console.log("[WhatsApp Web Auto] Media preview opened successfully via clipboard paste!");
                    if (onPreviewOpened) onPreviewOpened();
                } else {
                    console.log("[WhatsApp Web Auto] Paste did not open preview. Attempting file input fallback...");
                    uploadViaFileInput(file, onPreviewOpened);
                }
            }, 1200);
        }

        // Fallback: Upload through file input
        function uploadViaFileInput(file, callback) {
            const dt = new DataTransfer();
            dt.items.add(file);

            let fileInput = document.querySelector('input[type="file"][accept*="image"]')
                || document.querySelector('input[type="file"]');

            if (fileInput) {
                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => { if (callback) callback(); }, 1000);
                return;
            }

            // Click Attach Button (+ / paperclip) to reveal file input
            const attachBtn = document.querySelector('button[aria-label="Attach"]')
                || document.querySelector('div[aria-label="Attach"]')
                || document.querySelector('span[data-icon="plus"]')?.closest('button')
                || document.querySelector('span[data-icon="attach-menu-plus"]')?.closest('button')
                || document.querySelector('span[data-icon="clip"]')?.closest('button');

            if (attachBtn) {
                attachBtn.click();
                setTimeout(() => {
                    fileInput = document.querySelector('input[type="file"][accept*="image"]')
                        || document.querySelector('input[type="file"]');
                    if (fileInput) {
                        fileInput.files = dt.files;
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                        setTimeout(() => { if (callback) callback(); }, 1000);
                    } else {
                        console.warn("[WhatsApp Web Auto] File input could not be found.");
                    }
                }, 500);
            }
        }

        // Main Chat Processing Engine
        function checkAndProcessCurrentChat() {
            const urlParams = new URLSearchParams(window.location.search);
            const phone = urlParams.get('phone');

            if (phone && phone !== lastPhoneProcessed) {
                lastPhoneProcessed = phone;
                sendAttempted = false;
                isProcessingImage = false;
                console.log("[WhatsApp Web Auto] New phone target detected:", phone);

                const badge = document.getElementById('wa-helper-badge');
                if (badge) {
                    badge.style.background = '#0284c7';
                    badge.innerHTML = `⏳ Preparing chat for +${phone}...`;
                }
            }

            if (sendAttempted || isProcessingImage) return;

            // Check for Invalid Number Popup Modal
            const invalidPopup = document.querySelector('div[role="dialog"]');
            if (invalidPopup && (invalidPopup.innerText.includes("invalid") || invalidPopup.innerText.includes("Phone number shared via url"))) {
                console.warn("[WhatsApp Web Auto] Invalid phone number popup detected!");
                sendAttempted = true;
                broadcastSignal({ invalid: true, sent: false, phone: phone, timestamp: Date.now() });
                return;
            }

            // Read Current Task Info from GM storage
            let taskInfo = null;
            try {
                const rawTask = GM_getValue(WA_TASK_INFO_KEY, localStorage.getItem(WA_TASK_INFO_KEY));
                if (rawTask) taskInfo = typeof rawTask === "string" ? JSON.parse(rawTask) : rawTask;
            } catch (e) { }

            // Check if Image Attachment is commanded and present
            let imageData = null;
            try {
                const rawImg = GM_getValue(IMAGE_DATA_KEY, localStorage.getItem(IMAGE_DATA_KEY));
                if (rawImg) imageData = typeof rawImg === "string" ? JSON.parse(rawImg) : rawImg;
            } catch (e) { }

            const shouldSendImageFirst = Boolean(taskInfo && taskInfo.sendImage && imageData && imageData.dataUrl);

            // Wait for chat input or main container to be available
            const chatInput = getChatInput();
            const mainSendBtn = getMainSendButton();

            if (!chatInput && !mainSendBtn) {
                return; // Chat not ready yet
            }

            // ==========================================
            // FLOW A: SEND IMAGE FLYER (WITH CAPTION / TEXT)
            // ==========================================
            if (shouldSendImageFirst) {
                isProcessingImage = true;
                const badge = document.getElementById('wa-helper-badge');
                if (badge) {
                    badge.style.background = '#8b5cf6';
                    badge.innerHTML = `📸 Attaching image flyer for +${phone}...`;
                }

                const flyerFile = dataURLtoFile(imageData.dataUrl, imageData.name || 'campaign_flyer.jpg');
                if (!flyerFile) {
                    console.error("[WhatsApp Web Auto] Failed to create flyer file! Falling back to text only.");
                    isProcessingImage = false;
                    return;
                }

                attachImageFlyer(flyerFile, () => {
                    // Media Preview Opened!
                    console.log("[WhatsApp Web Auto] Media preview opened! Polling for green send button...");
                    if (badge) {
                        badge.style.background = '#f59e0b';
                        badge.innerHTML = `📸 Media preview open - waiting for send button...`;
                    }

                    waitForMediaSendButton((mediaSendBtn) => {
                        if (!mediaSendBtn) {
                            console.warn("[WhatsApp Web Auto] Media send button not ready after timeout. Retrying...");
                            isProcessingImage = false;
                            return;
                        }

                        console.log("[WhatsApp Web Auto] Found green media send button! Pacing human pause...");
                        if (badge) {
                            badge.style.background = '#10b981';
                            badge.innerHTML = `📸 Ready! Clicking Send in a moment...`;
                        }

                        // Ensure caption box contains the personalized message before sending
                        ensureMediaCaptionHasText(taskInfo?.text);

                        // Anti-Ban humanized pause before clicking media Send button
                        const imagePause = getRandomDelay(CONFIG.imagePreviewPauseMinMs, CONFIG.imagePreviewPauseMaxMs);

                        setTimeout(() => {
                            console.log("[WhatsApp Web Auto] Executing thorough click on green send button!");
                            clickElementThoroughly(mediaSendBtn);

                            // Enter key fallback on caption input if preview doesn't close
                            setTimeout(() => {
                                if (isMediaPreviewOpen()) {
                                    console.log("[WhatsApp Web Auto] Media preview still open after click; triggering Enter key fallback on caption...");
                                    const editables = document.querySelectorAll('div[contenteditable="true"]');
                                    const captionInput = editables.length > 0 ? editables[editables.length - 1] : null;
                                    if (captionInput) {
                                        try { captionInput.focus(); } catch (e) { }
                                        captionInput.dispatchEvent(new KeyboardEvent('keydown', {
                                            key: 'Enter',
                                            code: 'Enter',
                                            keyCode: 13,
                                            which: 13,
                                            bubbles: true,
                                            cancelable: true
                                        }));
                                    }
                                    const retryBtn = getMediaSendButton();
                                    if (retryBtn) clickElementThoroughly(retryBtn);
                                }
                            }, 700);

                            if (badge) {
                                badge.style.background = '#0284c7';
                                badge.innerHTML = `⏳ Sending image & caption...`;
                            }

                            // Wait for media preview overlay to close
                            let checks = 0;
                            const checkPreviewClosedInterval = setInterval(() => {
                                checks++;
                                if (!isMediaPreviewOpen()) {
                                    clearInterval(checkPreviewClosedInterval);
                                    console.log("[WhatsApp Web Auto] Media preview closed! Flyer and caption delivered together in one single message.");

                                    sendAttempted = true;
                                    isProcessingImage = false;

                                    // Handshake signal sent: Flyer & message are delivered together. NO second message is sent!
                                    setTimeout(() => {
                                        broadcastSignal({
                                            sent: true,
                                            phone: phone,
                                            withImage: true,
                                            withCaption: true,
                                            test: Boolean(taskInfo && taskInfo.isTest),
                                            timestamp: Date.now()
                                        });
                                    }, 600);
                                } else if (checks > 30) {
                                    clearInterval(checkPreviewClosedInterval);
                                    console.warn("[WhatsApp Web Auto] Preview overlay took too long to close.");
                                    isProcessingImage = false;
                                }
                            }, 400);

                        }, imagePause);
                    });
                });

                return;
            }

            // ==========================================
            // FLOW B: TEXT ONLY (NO IMAGE ATTACHED)
            // ==========================================
            if (mainSendBtn) {
                console.log("[WhatsApp Web Auto] Main send button detected (Text only flow)!");
                sendAttempted = true;

                if (CONFIG.autoSendWhatsAppWeb) {
                    const humanPause = getRandomDelay(1500, 3200);
                    const badge = document.getElementById('wa-helper-badge');
                    if (badge) {
                        badge.style.background = '#0284c7';
                        badge.innerHTML = `💬 Pacing before sending text to +${phone}...`;
                    }

                    setTimeout(() => {
                        clickElementThoroughly(mainSendBtn);
                        console.log("[WhatsApp Web Auto] Click executed! Broadcasting GM signal...");

                        setTimeout(() => {
                            broadcastSignal({
                                sent: true,
                                phone: phone,
                                test: Boolean(taskInfo && taskInfo.isTest),
                                timestamp: Date.now()
                            });
                        }, 600);
                    }, humanPause);
                } else {
                    mainSendBtn.style.border = "3px solid #f59e0b";
                    mainSendBtn.style.boxShadow = "0 0 15px #f59e0b";
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

        // Listen for manual clicks on send buttons as fallback
        document.addEventListener('click', (e) => {
            if (e.target && e.target.closest('[aria-label^="Send"], span[data-icon*="send"], span[data-testid*="send"], span[data-icon="wds-ic-send-filled"]')) {
                setTimeout(() => {
                    broadcastSignal({ sent: true, manual: true, timestamp: Date.now() });
                }, 600);
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

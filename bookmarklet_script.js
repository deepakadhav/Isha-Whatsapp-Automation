/**
 * Ishangam Call Campaign - Instant Bookmarklet / Browser Console Script (v1.0.1)
 * 
 * Instructions:
 * 1. Open DevTools in Chrome/Edge (F12 or right-click -> Inspect -> Console).
 * 2. Paste this code into the Console and press Enter.
 */

(function () {
    console.log("⚡ Executing Ishangam WhatsApp & Form Automation...");

    // 1. Select 'Complete' in Main Form Call Outcome (excluding modal dropdowns)
    let selectEl = document.querySelector('form.js_call_campaignform select.js_portal_call_status')
        || document.querySelector('form.js_call_campaignform select[name$="_status"]')
        || document.querySelector('select.js_portal_call_status')
        || Array.from(document.querySelectorAll('select')).find(s => s.name && s.name.endsWith('_status') && s.name !== 'try_alt_call_status');

    if (selectEl) {
        selectEl.value = 'call_completed';
        let targetOption = Array.from(selectEl.options).find(opt => opt.value === 'call_completed');
        if (targetOption) {
            Array.from(selectEl.options).forEach(opt => opt.selected = false);
            targetOption.selected = true;
        }

        selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        selectEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        if (window.$) {
            try {
                window.$(selectEl).val('call_completed').trigger('change').trigger('input');
            } catch (e) {}
        }
    } else {
        console.warn("⚠️ Main Call Outcome select element not found.");
    }

    // 2. Unhide dependent sections & clear red alert error zones
    document.querySelectorAll('.js_portal-outcome-dependent, .js_portal-feedback-wrap, .js_portal-remarks-wrap').forEach(el => {
        el.classList.remove('d-none');
        el.style.display = 'block';
    });
    document.querySelectorAll('.js_errzone').forEach(el => el.style.display = 'none');

    // 3. Fill Remarks as 'whatsapp send'
    const remarkEl = document.querySelector('form.js_call_campaignform textarea.js_portal-remarks-input, textarea.js_portal-remarks-input, textarea[name$="_contact_remark"]');
    if (remarkEl) {
        remarkEl.value = 'whatsapp send';
        remarkEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        remarkEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        if (window.$) {
            try {
                window.$(remarkEl).val('whatsapp send').trigger('change').trigger('input');
            } catch (e) {}
            }
    } else {
        console.warn("⚠️ Remarks textarea element not found.");
    }

    // 4. Find & Open WhatsApp Web Link
    let waUrl = null;
    const waButton = document.querySelector('button[onclick*="openWhatsApp"], button[data-url*="whatsapp.com"]');
    if (waButton && waButton.getAttribute('data-url')) {
        waUrl = waButton.getAttribute('data-url');
    } else {
        const waLink = document.querySelector('a.partner_whatsapp, [data-url*="whatsapp.com"]');
        if (waLink) waUrl = waLink.getAttribute('data-url') || waLink.getAttribute('href');
    }

    if (waUrl) {
        let cleanUrl = waUrl.replace(/&amp;/g, '&').replace("https://api.whatsapp.com/send", "https://web.whatsapp.com/send");
        window.open(cleanUrl, '_blank');
        console.log("✅ Opened WhatsApp Web with prefilled message.");
    } else {
        console.warn("⚠️ WhatsApp URL not found on page.");
    }

    alert("✅ Form Marked Complete ('whatsapp send') & WhatsApp opened!");
})();

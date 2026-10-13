# 🛡️ Ishangam Call Campaign WhatsApp Automation (Anti-Ban Safe Edition v2.3.0)

This script automates sending WhatsApp messages, marking call outcomes, entering remarks, and continuously processing leads on **Ishangam Call Campaign** (`ishangam.isha.in`) with robust anti-ban protections, image flyer attachments, test messaging, and dynamic run control.

---

## 🌟 What's New in v2.3.0

1. **📸 Image Flyer Attachment (Sends Image First ➔ Then Text Message)**:
   - Attach program flyers, posters, or brochures directly in the UI widget (`📎 Select Image`).
   - Automatically optimizes and resizes images in-browser to ~150-250KB for fast transfer and crisp mobile display.
   - **Sequenced Flow**: When enabled, the script uploads the image first, previews it, clicks send, waits a humanized anti-ban pause (2.5s to 4s), and then sends the personalized text message.
   - Toggle on/off anytime with the `📸 Attach Image Flyer` checkbox, or click `✕` to remove and revert to text-only mode.

2. **🧪 Test Message Mode**:
   - Dedicated **`🧪 Test`** button to verify message formatting and image attachments before starting campaigns.
   - Send tests either to the **Current Lead** or to a **Custom Phone Number** (e.g. your own WhatsApp number).
   - Test sends **DO NOT** increment campaign run counters, **DO NOT** mark outcomes, and **DO NOT** advance leads on Ishangam CRM.

3. **🔄 Full-Stack Campaign & WhatsApp State Reset**:
   - Prominent **`🔄 Reset State`** button in both the Ishangam widget and WhatsApp Web badge overlay.
   - Clears run counters (`0 / 30`), cancels countdowns, purges pending navigation URLs, and clears WhatsApp Web's internal session cache to prevent sending old messages from yesterday's campaign.
   - **Fresh Session Guard**: When opening a fresh browser session or tab, the automation starts strictly in an idle, manually cleared state.

4. **🎯 Dynamic Max Messages Limit (e.g. 30 Messages Run)**:
   - Set the exact number of messages to send on any run (e.g., `30`, `50`, or `0` for unlimited) directly in the UI widget.
   - Tracks progress in real-time (`Sent: 12 / 30`) and **automatically halts** once the target is reached.

5. **⏳ Randomized 10s to 3-Minute Humanized Gaps**:
   - Random interval between **10 seconds and 180 seconds (3 minutes)** between leads to eliminate robotic patterns.
   - Live countdown display formatted clearly in minutes & seconds (e.g., `🟢 Sending next lead in 2m 15s (12/30)`).

6. **🛡️ Complete Anti-Ban Suite**:
   - **Contact Name Personalization**: Automatically prepends the lead's name (`Namaskaram [Name]! 🙏`) to make every outgoing message unique.
   - **Batch Cooldown Breathers**: Automatic 3-minute cooldown every 10 messages.
   - **Single WhatsApp Tab Reuse**: Direct cross-tab communication avoids opening dozens of browser tabs.
   - **Delivery Confirmation Handshake**: Automatically confirms delivery before moving to the next lead.

---

## 🚀 Quick Start & Usage

1. Open **[ishangam.isha.in/call_campaign](https://ishangam.isha.in/call_campaign/)** with Tampermonkey / Violentmonkey enabled.
2. In the floating bottom-right control widget:
   - Click **`🔄 Reset State`** at the beginning of a fresh campaign to wipe any lingering state.
   - *(Optional)* Click **`📎 Select Image`** to attach a flyer image.
   - *(Optional)* Click **`🧪 Test`** to send a test message to your own phone number first.
   - Set **🎯 Max Limit** (default: `30`).
   - Set **⏳ Delay Range** (default: `10` to `180` sec).
3. Click **`▶️ Start Safe Auto Loop`**.
4. The script will open WhatsApp Web, send the image flyer first, send the personalized text message, record the outcome, and pace through up to your set target limit before stopping automatically!

---

## ⚙️ Configuration Defaults

Inside [`ishangam_whatsapp_automation.user.js`](file:///e:/Isha/Whatsapp%20Automation/ishangam_whatsapp_automation.user.js#L20-L45):
```javascript
const CONFIG = {
    defaultRemark: "whatsapp send",
    autoSendWhatsAppWeb: true,   // Set false for manual send button clicking
    autoCloseWhatsAppTab: false, // Keep 1 single WhatsApp tab open
    
    // Anti-Ban Dynamic Delays (10s to 3 min)
    defaultMinDelaySec: 10,      // Minimum 10 seconds between messages
    defaultMaxDelaySec: 180,     // Maximum 3 minutes (180s) between messages
    
    // Dynamic Max Send Limit per Run
    defaultMaxMessages: 30,      // Stop after 30 messages (0 = unlimited)
    
    // Anti-Ban Batch Cooldowns
    batchSize: 10,               // Cooldown break every 10 messages
    batchCooldownMs: 180000,     // 3-minute break between batches
    
    // Image & Text Inter-Message Delays
    imagePreviewPauseMinMs: 1500,
    imagePreviewPauseMaxMs: 2800,
    betweenImageAndTextMinMs: 2500,
    betweenImageAndTextMaxMs: 4000
};
```

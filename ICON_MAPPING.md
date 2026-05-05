# Icon Mapping - Emoji ke Custom Assets

## Available Assets
```
ic_abstract.svg        - Abstract shapes
ic_ai.svg             - AI/Machine Learning
ic_application.svg    - Applications
ic_aurora.svg         - Aurora/Northern lights
ic_automation.svg     - Automation/Bot
ic_build.png          - Build/Construction
ic_check.svg          - Check/Success
ic_code.svg           - Code/Development
ic_connection.svg     - Connection
ic_correct.svg        - Correct/Valid
ic_dashboard.svg      - Dashboard
ic_dashboard_1.svg    - Dashboard variant
ic_db.svg             - Database
ic_dev.svg            - Developer
ic_development.svg    - Development
ic_fingerprint.svg    - Fingerprint/Identity
ic_human.svg          - Human/User
ic_loading.svg        - Loading/Spinner
ic_logo.png           - Application Logo
ic_luv.svg            - Love/Heart
ic_monitoring.svg     - Monitoring/Watch
ic_moon.svg           - Moon/Night
ic_performance.svg    - Performance
ic_planet.svg         - Planet/Space
ic_portal.svg         - Portal/Gateway
ic_rejection.svg      - Rejection/Error
ic_rules.svg          - Rules/Settings
ic_run.svg            - Run/Execute
ic_send.svg           - Send/Arrow
ic_srv_bni.jpg        - Service BNI
ic_stars.svg          - Stars/Rating
ic_universe.svg       - Universe/Space
```

## Emoji to Icon Mapping

| Emoji | Context | Best Match Asset | Fallback |
|-------|---------|------------------|----------|
| 🏠 | Home tab | ic_dashboard.svg | Keep emoji |
| 📊 | Analysis/Signal tab | ic_performance.svg | Keep emoji |
| ⚡ | Futures/Power | ic_run.svg | Keep emoji |
| 🔬 | Research/Lab | ic_development.svg | Keep emoji |
| 🆕 | Momentum/New | ic_stars.svg | Keep emoji |
| 🇮🇩 | Indonesia | Keep emoji | - |
| 🇺🇸 | USA | Keep emoji | - |
| 📰 | News | ic_development.svg | Keep emoji |
| 🧠 | AI Expert/Smart Money | ic_ai.svg | Keep emoji |
| 🟠 | Orange/DeFi/DEX | ic_portal.svg | Keep emoji |
| 🪐 | Planets/Market | ic_planet.svg | Keep emoji |
| 🤖 | Bot/Automation | ic_automation.svg | Keep emoji |
| 🎯 | Target/Goal | ic_performance.svg | Keep emoji |
| 📈 | Trading/Portfolio | ic_performance.svg | Keep emoji |
| 💼 | Wallet/Portfolio | ic_fingerprint.svg | Keep emoji |
| 🔔 | Alerts/Notifications | ic_monitoring.svg | Keep emoji |
| ⏪ | History/Backtest | ic_loading.svg | Keep emoji |
| 💰 | Balance/Money | ic_fingerprint.svg | Keep emoji |
| 🔄 | Refresh/Rotate | ic_loading.svg | Keep emoji |
| 🔍 | Search | ic_development.svg | Keep emoji |
| 🟢 | Buy/Long | ic_check.svg | Keep emoji |
| 🔴 | Sell/Short | ic_rejection.svg | Keep emoji |
| 📋 | Activity/Logs | ic_monitoring.svg | Keep emoji |

## Implementation Strategy

1. **Phase 1**: Replace main navigation icons (nav-icon class)
2. **Phase 2**: Replace KPI/Dashboard icons (home-kpi-icon)
3. **Phase 3**: Replace button icons (buttons with emojis)
4. **Phase 4**: Replace inline content icons
5. **Phase 5**: Test and refine

## CSS Class to Add
```css
.nav-icon img,
.home-kpi-icon img,
.btn-icon img {
    width: 20px;
    height: 20px;
    vertical-align: middle;
}
```

## HTML Pattern
```html
<!-- Before: -->
<span class="nav-icon">🤖</span>

<!-- After: -->
<span class="nav-icon">
    <img src="images/ic_automation.svg" alt="Bot" title="Automation">
</span>
```

// 1. [테마 즉시 적용] 페이지 로딩 전 배경 색상 깜빡임(FOUC) 방지
(function() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// 2. [버튼 동기화 및 이벤트 처리]
document.addEventListener('DOMContentLoaded', () => {
    // 페이지 내 모든 테마 토글 버튼의 아이콘을 현재 테마 상태에 맞게 동기화
    function updateAllThemeButtons(theme) {
        const buttons = document.querySelectorAll('.theme-toggle-btn');
        const icon = theme === 'dark' ? '☀️' : '🌙';
        buttons.forEach(btn => {
            btn.textContent = icon;
        });
    }

    // 페이지 로드시 아이콘 초기화
    const currentTheme = localStorage.getItem('theme') || 'light';
    updateAllThemeButtons(currentTheme);

    // 이벤트 위임을 사용하여 페이지 내 어떤 .theme-toggle-btn이 클릭되든 작동하도록 처리
    document.addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('.theme-toggle-btn');
        if (!toggleBtn) return;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const nextTheme = isDark ? 'light' : 'dark';

        if (nextTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }

        localStorage.setItem('theme', nextTheme);
        updateAllThemeButtons(nextTheme);
    });
});

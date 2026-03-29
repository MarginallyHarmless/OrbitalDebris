export function updateProgress(fraction, statusText) {
  const progressBar = document.getElementById('progress-bar');
  const loadingStatus = document.getElementById('loading-status');

  progressBar.style.width = `${fraction * 100}%`;
  loadingStatus.textContent = statusText.toUpperCase();
}

export function hideLoader() {
  const loadingScreen = document.getElementById('loading-screen');
  loadingScreen.classList.add('fade-out');

  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 800);
}

export function showLoader() {
  const loadingScreen = document.getElementById('loading-screen');
  loadingScreen.classList.remove('fade-out');
  loadingScreen.style.display = 'flex';
}

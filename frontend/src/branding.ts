function setupMenu() {
  const menu = document.querySelector<HTMLButtonElement>(".menu-button");
  const mobileMenu = document.querySelector<HTMLElement>(".mobile-menu");
  if (!menu || !mobileMenu || menu.dataset.navigationReady === "true") return;

  const closeMenu = () => {
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-label", "Open menu");
    menu.textContent = "☰";
    mobileMenu.classList.remove("open");
  };

  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.textContent = open ? "×" : "☰";
    mobileMenu.classList.toggle("open", open);
  });
  mobileMenu
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  menu.dataset.navigationReady = "true";
}

export function setupVirasyaBranding() {
  setupMenu();
  return undefined;
}

lucide.createIcons();

// Accordion Trigger Logic
const faqTriggers = document.querySelectorAll(".faq-trigger");
faqTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => {
    const item = trigger.parentElement;
    const content = item.querySelector(".faq-content");
    const isActive = item.classList.contains("active");

    // Close all FAQ items
    document.querySelectorAll(".faq-item").forEach((otherItem) => {
      otherItem.classList.remove("active");
      otherItem.querySelector(".faq-content").style.maxHeight = null;
    });

    // Toggle current
    if (!isActive) {
      item.classList.add("active");
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });
});

// ScrollSpy Logic to highlight active sidebar section & mobile select
const sections = document.querySelectorAll(".doc-section");
const navLinks = document.querySelectorAll(".nav-link");
const mobileSelect = document.getElementById("mobile-nav-select");
const SCROLL_OFFSET = 130;

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const top =
    target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
  window.scrollTo({ top, behavior: "smooth" });
}

// Intercept nav-link clicks
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href").slice(1);
    event.preventDefault();
    scrollToSection(id);
  });
});

// Handle mobile navigation select dropdown change
if (mobileSelect) {
  mobileSelect.addEventListener("change", (event) => {
    const sectionId = event.target.value;
    scrollToSection(sectionId);
  });
}

function setActiveNavLink(sectionId) {
  navLinks.forEach((link) => {
    link.classList.toggle(
      "active",
      link.getAttribute("href") === `#${sectionId}`,
    );
  });
  if (mobileSelect && mobileSelect.value !== sectionId) {
    mobileSelect.value = sectionId;
  }
}

function updateScrollSpy() {
  const atBottom =
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 2;

  if (atBottom) {
    setActiveNavLink(sections[sections.length - 1].getAttribute("id"));
    return;
  }

  let currentSectionId = "";
  sections.forEach((section) => {
    const sectionTop = section.offsetTop;
    if (window.scrollY >= sectionTop - SCROLL_OFFSET) {
      currentSectionId = section.getAttribute("id");
    }
  });

  if (currentSectionId) setActiveNavLink(currentSectionId);
}

window.addEventListener("scroll", updateScrollSpy);
updateScrollSpy();

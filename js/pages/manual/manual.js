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

// ScrollSpy Logic to highlight active sidebar section
const sections = document.querySelectorAll(".doc-section");
const navLinks = document.querySelectorAll(".nav-link");
const SCROLL_OFFSET = 130;

// Intercept nav-link clicks: with <base href="../"> in place, native
// "#id" anchors resolve against the base URL and navigate away from
// the page instead of scrolling to the section. Handle it manually.
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href").slice(1);
    const target = document.getElementById(id);
    if (!target) return;

    event.preventDefault();
    const top =
      target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top, behavior: "smooth" });
  });
});

function setActiveNavLink(sectionId) {
  navLinks.forEach((link) => {
    link.classList.toggle(
      "active",
      link.getAttribute("href") === `#${sectionId}`,
    );
  });
}

function updateScrollSpy() {
  // Some sections (e.g. a trailing FAQ with nothing after it) sit at
  // the very end of the page. Their offsetTop - SCROLL_OFFSET can be
  // greater than the maximum possible scroll position, so the normal
  // per-section check below would never match them. Catch that case
  // explicitly by checking if the user has hit the bottom of the page.
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

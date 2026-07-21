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

// Intercept nav-link clicks: with <base href="../"> in place, native
// "#id" anchors resolve against the base URL and navigate away from
// the page instead of scrolling to the section. Handle it manually.
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href").slice(1);
    const target = document.getElementById(id);
    if (!target) return;

    event.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 130;
    window.scrollTo({ top, behavior: "smooth" });
  });
});

window.addEventListener("scroll", () => {
  let currentSectionId = "";
  sections.forEach((section) => {
    const sectionTop = section.offsetTop;
    if (window.scrollY >= sectionTop - 130) {
      currentSectionId = section.getAttribute("id");
    }
  });

  if (currentSectionId) {
    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href") === `#${currentSectionId}`) {
        link.classList.add("active");
      }
    });
  }
});

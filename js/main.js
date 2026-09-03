/**
 * LoongClan — main.js
 * Progressive enhancement only. All content exists in HTML.
 * Responsibilities:
 *   1. Add .js-active class for scroll-reveal CSS opt-in
 *   2. IntersectionObserver for scroll-triggered section reveals
 *   3. Header blur on scroll
 *   4. Mobile menu toggle
 */
(function () {
  'use strict';

  // 1. Signal JS is active (enables scroll-reveal CSS)
  document.documentElement.classList.add('js-active');

  // 2. Scroll reveal via IntersectionObserver
  const revealers = document.querySelectorAll('.scroll-reveal');
  if (revealers.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    revealers.forEach(function (el) { observer.observe(el); });
  }

  // 3. Header blur on scroll past hero
  var header = document.getElementById('header');
  var hero = document.getElementById('hero');
  if (header && hero && 'IntersectionObserver' in window) {
    var headerObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            header.classList.remove('header--scrolled');
          } else {
            header.classList.add('header--scrolled');
          }
        });
      },
      { threshold: 0, rootMargin: '-' + header.offsetHeight + 'px 0px 0px 0px' }
    );
    headerObserver.observe(hero);
  }

  // 4. Mobile menu toggle
  var toggle = document.getElementById('menu-toggle');
  var nav = document.getElementById('header-nav');
  if (toggle && nav) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.classList.toggle('active');
      toggle.setAttribute('aria-expanded', isOpen);
    });

    // Close menu when clicking a nav link
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();

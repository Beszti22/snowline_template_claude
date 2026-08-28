(function(){
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  toggle.addEventListener('click', function(){
    var open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- Stagger: reveal siblings animate in sequence ----- */
  var groups = {};
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  revealEls.forEach(function(el){
    var parent = el.parentNode;
    if(!parent) return;
    var siblings = parent.querySelectorAll(':scope > .reveal');
    if(siblings.length > 1){
      var idx = Array.prototype.indexOf.call(siblings, el);
      el.style.setProperty('--reveal-delay', Math.min(idx, 6) * 90 + 'ms');
    }
  });

  /* ----- Count-up for stat numbers ----- */
  function countUp(el){
    var target = parseFloat(el.getAttribute('data-count'));
    if(isNaN(target)) return;
    var suffix = el.getAttribute('data-suffix') || '';
    if(prefersReduced){ el.textContent = target + suffix; return; }
    var start = null, dur = 1400;
    function step(ts){
      if(start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ----- Reveal on scroll ----- */
  if(prefersReduced || !('IntersectionObserver' in window)){
    revealEls.forEach(function(el){ el.classList.add('in-view'); });
    document.querySelectorAll('[data-count]').forEach(countUp);
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          entry.target.querySelectorAll('[data-count]').forEach(countUp);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function(el){ io.observe(el); });
  }

  /* ----- Scroll progress bar + sticky-nav shrink + hero parallax ----- */
  var progress = document.getElementById('scrollProgress');
  var header = document.querySelector('header.site-header');
  var heroImg = document.querySelector('.hero-visual img');
  var ticking = false;
  function onScroll(){
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    if(progress){ progress.style.transform = 'scaleX(' + (docH > 0 ? y / docH : 0) + ')'; }
    if(header){ header.classList.toggle('scrolled', y > 20); }
    if(heroImg && !prefersReduced && y < window.innerHeight){
      heroImg.style.setProperty('--parallax', (y * 0.12).toFixed(1) + 'px');
    }
    ticking = false;
  }
  window.addEventListener('scroll', function(){
    if(!ticking){ requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();
})();

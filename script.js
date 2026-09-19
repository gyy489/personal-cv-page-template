const schoolSections = Array.from(document.querySelectorAll(".school-card"));
const schoolBodyOwners = new WeakMap();
let schoolStage = null;
const paperSections = Array.from(document.querySelectorAll(".paper-card"));
const paperBodyOwners = new WeakMap();
const paperList = document.querySelector(".paper-list");
let paperNav = null;
let paperStage = null;
const portfolioSections = Array.from(document.querySelectorAll(".portfolio-card"));
const activitySections = Array.from(document.querySelectorAll(".activity-group"));
const secondarySections = Array.from(
  document.querySelectorAll(
    ".school-card, .portfolio-card, .activity-group, details.cv-group",
  ),
);
const embeddedPages = Array.from(document.querySelectorAll(".baike-window iframe[data-src]"));
const embeddedPageLoadingTimers = new WeakMap();
const embeddedPagePreviewDelay = 3000;
const backgroundSchoolBodies = new WeakMap();
const backgroundMediaLoading = {
  started: false,
  scheduled: false,
  images: [],
  pages: [],
  imageActive: false,
  pageActive: false,
};
const downloadButton = document.querySelector("#download-cv");
const profileName = document.querySelector("#page-title");
const resumeActions = document.querySelector(".resume-actions");
const paperButtons = Array.from(document.querySelectorAll(".paper-fulltext"));
const paperViewer = document.querySelector("#paper-viewer");
const paperViewerTitle = document.querySelector("#paper-viewer-title");
const paperViewerFrame = document.querySelector("#paper-viewer-frame");
const paperViewerExternal = document.querySelector("#paper-viewer-external");
const paperViewerClose = document.querySelector("#paper-viewer-close");
const resumePage = document.querySelector(".resume-page");
const imageViewer = document.querySelector("#image-viewer");
const imageViewerImage = document.querySelector("#image-viewer-image");
let imageViewerScrollState = null;

let stateBeforePrint = null;
let pageMinHeightBeforePrint = null;
let suppressSchoolNavigation = false;
const schoolScrollPositions = new WeakMap();
const expansionScrollPositions = new WeakMap();
const expansionRetentionSerials = new WeakMap();
const automaticallyClosedSchools = new WeakSet();
let activeCollapse = null;

function syncProfileNameWidth() {
  if (!profileName || !resumeActions) return;

  const actionItems = [...resumeActions.children];
  const firstActionBox = actionItems.at(0)?.getBoundingClientRect();
  const lastActionBox = actionItems.at(-1)?.getBoundingClientRect();
  const targetWidth = firstActionBox && lastActionBox
    ? (lastActionBox.right - firstActionBox.left) * 1.3
    : 0;
  if (!targetWidth) return;
  profileName.style.letterSpacing = "0px";
  const nameRange = document.createRange();
  nameRange.selectNodeContents(profileName);
  const naturalNameWidth = nameRange.getBoundingClientRect().width;
  const characterCount = [...profileName.textContent.trim()].length;
  if (!characterCount || !naturalNameWidth) return;

  const spacing = Math.max(0, (targetWidth - naturalNameWidth) / characterCount);
  profileName.style.letterSpacing = `${spacing}px`;
}

let profileNameSyncFrame = 0;
function scheduleProfileNameWidthSync() {
  window.cancelAnimationFrame(profileNameSyncFrame);
  profileNameSyncFrame = window.requestAnimationFrame(syncProfileNameWidth);
}

scheduleProfileNameWidthSync();
document.fonts?.ready.then(scheduleProfileNameWidthSync);
window.addEventListener("resize", scheduleProfileNameWidthSync);

function getPortfolioYear(section) {
  if (section.dataset.portfolioTail === "true") return Number.NEGATIVE_INFINITY;

  const meta = section
    .querySelector(":scope > .portfolio-card__template")
    ?.content.querySelector(".portfolio-card__meta")
    ?.textContent.trim();
  const year = meta?.match(/^(\d{4})/)?.[1];

  return year ? Number(year) : Number.NEGATIVE_INFINITY;
}

const portfolioList = document.querySelector(".portfolio-list");
const activityList = document.querySelector(".activity-list");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const portfolioTransitionDuration = 640;
const portfolioBodyOwners = new WeakMap();
const portfolioSubBodyOwners = new WeakMap();
const initializedPortfolioSublists = new WeakSet();
const portfolioMovementAnimations = new WeakMap();
const workPresentationAnimations = new WeakMap();
const activityBodyOwners = new WeakMap();
let portfolioStage = null;
let portfolioNav = null;
let activityNav = null;
let activityStage = null;
let portfolioStickyFrame = 0;
let portfolioInteractionLocked = false;
let portfolioTransitionSerial = 0;
let activityInteractionLocked = false;
let activityTransitionSerial = 0;
let pendingActivitySection = null;
let activeActivityTarget = null;
let activePortfolioSwitch = null;
let pendingPortfolioSection = null;
let activePortfolioTarget = null;
let activeNavigationScroll = null;
let viewportHeightRetentionSerial = 0;
let retainedViewportTailActive = false;
let retainedViewportTailFrame = 0;
const stickyBarOwners = new Map();
const sectionOpenedAt = new WeakMap();
const accidentalCloseGuardDuration = 420;

function markSectionOpened(section) {
  sectionOpenedAt.set(section, performance.now());
}

function isAccidentalEarlyClose(section) {
  const openedAt = sectionOpenedAt.get(section);
  return section.open && openedAt !== undefined
    && performance.now() - openedAt < accidentalCloseGuardDuration;
}

function cancelNavigationScroll() {
  activeNavigationScroll?.cancel();
}

function scrollNavigationToTop(anchor, duration = 520, topOffset = 0) {
  cancelNavigationScroll();
  if (!anchor) return Promise.resolve();

  const startY = window.scrollY;
  const targetY = Math.max(0, anchor.getBoundingClientRect().top + startY - topOffset);
  ensurePageHeightForScroll(targetY);
  if (prefersReducedMotion.matches || Math.abs(targetY - startY) < 1) {
    window.scrollTo({ top: targetY, behavior: "instant" });
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const scroll = { frame: 0, cancel: null };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(scroll.frame);
      if (activeNavigationScroll === scroll) activeNavigationScroll = null;
      resolve();
    };
    scroll.cancel = finish;
    activeNavigationScroll = scroll;
    const startedAt = performance.now();
    const advance = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo({ top: startY + (targetY - startY) * eased, behavior: "instant" });
      if (progress < 1) scroll.frame = window.requestAnimationFrame(advance);
      else finish();
    };
    scroll.frame = window.requestAnimationFrame(advance);
  });
}

function getResumeHeightMetrics() {
  const pageTop = resumePage.getBoundingClientRect().top + window.scrollY;
  const bottomMargin = Number.parseFloat(getComputedStyle(resumePage).marginBottom) || 0;
  const contentElements = resumePage.querySelectorAll(":scope > header, :scope > main, :scope > footer");
  const contentBottom = Math.max(
    pageTop,
    ...Array.from(contentElements, (element) => element.getBoundingClientRect().bottom + window.scrollY),
  );
  return {
    pageTop,
    bottomMargin,
    naturalHeight: Math.max(0, Math.ceil(contentBottom - pageTop)),
  };
}

function ensurePageHeightForScroll(targetY) {
  if (!resumePage) return;
  const { pageTop, bottomMargin } = getResumeHeightMetrics();
  const requiredHeight = Math.max(
    0,
    Math.ceil(targetY + window.innerHeight - pageTop - bottomMargin),
  );
  const currentHeight = Number.parseFloat(resumePage.style.minHeight) || 0;
  if (requiredHeight > currentHeight) {
    resumePage.style.minHeight = `${requiredHeight}px`;
  }
}

function settleRetainedViewportHeight(retentionSerial = viewportHeightRetentionSerial) {
  if (!resumePage || retentionSerial !== viewportHeightRetentionSerial) return;
  const { pageTop, bottomMargin, naturalHeight } = getResumeHeightMetrics();
  const requiredHeight = Math.max(
    0,
    Math.ceil(window.scrollY + window.innerHeight - pageTop - bottomMargin),
  );

  if (requiredHeight > naturalHeight + 1) {
    resumePage.style.minHeight = `${requiredHeight}px`;
    retainedViewportTailActive = true;
  } else {
    resumePage.style.removeProperty("min-height");
    retainedViewportTailActive = false;
  }
}

function scheduleRetainedViewportTailUpdate() {
  if (!retainedViewportTailActive || retainedViewportTailFrame) return;
  retainedViewportTailFrame = window.requestAnimationFrame(() => {
    retainedViewportTailFrame = 0;
    settleRetainedViewportHeight();
  });
}

function showStickyBar(element, owner, fadeIn = true) {
  if (!element) return;
  stickyBarOwners.set(element, owner);
  element.classList.add("sticky-bar", "sticky-bar--visible");
  element.classList.toggle("sticky-bar--entering", fadeIn && !prefersReducedMotion.matches);
}

function hideStickyBars(owner) {
  for (const [element, barOwner] of stickyBarOwners) {
    if (barOwner !== owner) continue;
    stickyBarOwners.delete(element);
    element.classList.remove("sticky-bar--visible", "sticky-bar--entering");
  }
}

function cancelPortfolioSwitch() {
  pendingPortfolioSection = null;
  cancelNavigationScroll();
  activePortfolioSwitch?.cancel();
}

function animatePortfolioContent(body, keyframes, options) {
  const heading = body.querySelector(":scope > .portfolio-work__heading");
  // Keep the header's white bar intact while only its content crossfades.
  const targets = heading ? [...body.children].filter((child) => child !== heading) : [body];
  return targets.map((target) => target.animate(keyframes, options));
}

async function togglePortfolioSection(section) {
  if (suppressSchoolNavigation) return;
  if (portfolioInteractionLocked) {
    pendingPortfolioSection = section === activePortfolioTarget ? null : section;
    return;
  }

  const isSubcard = section.classList.contains("portfolio-subcard");
  const sublist = isSubcard ? section.closest(".portfolio-sublist") : null;
  const stage = isSubcard ? sublist?.querySelector(":scope > .portfolio-substage") : portfolioStage;
  const interactionList = isSubcard ? sublist : portfolioList;
  if (!stage) return;
  const motionElements = isSubcard ? getPortfolioSubMotionElements(sublist) : getPortfolioMotionElements();
  if (section.open) {
    if (isAccidentalEarlyClose(section)) return;
    startAnimatedCollapse(section, motionElements);
    return;
  }

  const retentionSerial = prepareExpandableToggle(section);
  if (!isSubcard) loadPortfolioProject(section);
  const workPositions = captureWorkPresentation(section);
  const titleElements = isSubcard
    ? [...sublist.querySelectorAll(":scope > .portfolio-subnav > .portfolio-subcard")]
    : portfolioSections;
  const previousPositions = capturePortfolioPositions(titleElements);
  const outgoingBody = stage.firstElementChild;
  // Only first opening fades the bar; switches inherit an opaque white header.
  const firstOpening = !outgoingBody;
  showStickyBar(isSubcard ? sublist.querySelector(".portfolio-subnav") : portfolioNav, section, firstOpening);
  showStickyBar(getExpandableBody(section)?.querySelector(".portfolio-work__heading"), section, firstOpening);
  const outgoingOwner = outgoingBody && (isSubcard
    ? portfolioSubBodyOwners.get(outgoingBody) : portfolioBodyOwners.get(outgoingBody));
  const outgoingWork = outgoingOwner?.classList.contains("portfolio-work--presented")
    ? captureWorkPresentation(outgoingOwner, true) : null;
  const oldHeight = stage.getBoundingClientRect().height;
  const scrollPosition = window.scrollY;
  const serial = ++portfolioTransitionSerial;
  const animations = [];
  const originalHeight = stage.style.height;
  const originalOverflow = stage.style.overflow;
  const transition = { canceled: false, cancel: null };
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    animations.forEach((animation) => animation.cancel());
    stage.style.height = originalHeight;
    stage.style.overflow = originalOverflow;
    if (activePortfolioSwitch === transition) {
      activePortfolioSwitch = null;
      activePortfolioTarget = null;
    }
  };
  transition.cancel = () => {
    transition.canceled = true;
    hideStickyBars(section);
    cancelWorkPresentation(section);
    if (outgoingOwner) cancelWorkPresentation(outgoingOwner);
    cleanup();
    if (serial === portfolioTransitionSerial) {
      portfolioInteractionLocked = false;
      interactionList?.removeAttribute("aria-busy");
    }
  };
  activePortfolioSwitch = transition;
  activePortfolioTarget = section;
  portfolioInteractionLocked = true;
  interactionList?.setAttribute("aria-busy", "true");
  stage.style.height = `${oldHeight}px`;
  stage.style.overflow = "clip";

  try {
    if (outgoingBody && !prefersReducedMotion.matches) {
      const exit = animatePortfolioContent(outgoingBody, [{ opacity: 1 }, { opacity: 0 }], {
        duration: 160, easing: "ease-in", fill: "forwards",
      });
      animations.push(...exit);
      await Promise.all(exit.map((animation) => animation.finished.catch(() => undefined)));
    }
    if (transition.canceled) return;

    closeOtherExpandableSections(section);
    if (isSubcard) section.classList.add("portfolio-subcard--active");
    else if (section.dataset.portfolioTail !== "true") section.classList.add("portfolio-card--active");
    section.open = true;
    markSectionOpened(section);
    if (isSubcard) movePortfolioSubBodyToStage(section, stage);
    else movePortfolioBodyToStage(section);
    const body = getExpandableBody(section);
    if (!body) return;
    prioritizePortfolioImages(body);

    // Layout stays in the same stage: no empty frame between old and new details.
    const newHeight = body.getBoundingClientRect().height;
    window.scrollTo({ top: scrollPosition, behavior: "instant" });
    // “更多作品”有两层吸顶导航。为外层作品导航预留高度，避免
    // 内层作品的时间与材料信息被标题栏覆盖；独立的项目列表不偏移。
    const outerPortfolioList = isSubcard ? sublist.closest(".portfolio-list") : null;
    const navigationTopOffset = outerPortfolioList ? portfolioNav?.offsetHeight || 0 : 0;
    const navigationScroll = scrollNavigationToTop(interactionList, 520, navigationTopOffset);
    if (outgoingWork) animateWorkPresentation(outgoingOwner, outgoingWork, false);
    if (section.dataset.portfolioTail !== "true") animateWorkPresentation(section, workPositions);
    const titleMovement = animatePortfolioLayout(previousPositions, titleElements);

    if (!prefersReducedMotion.matches) {
      const resize = stage.animate([{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], {
        duration: portfolioTransitionDuration, easing: "cubic-bezier(0.45, 0, 0.2, 1)", fill: "forwards",
      });
      const enter = animatePortfolioContent(body, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 320, delay: 60, easing: "ease-out", fill: "both",
      });
      animations.push(resize, ...enter);
      await Promise.all([resize.finished.catch(() => undefined), ...enter.map((animation) => animation.finished.catch(() => undefined)), titleMovement, navigationScroll]);
    } else {
      stage.style.height = `${newHeight}px`;
      await navigationScroll;
    }
  } finally {
    cleanup();
    if (serial === portfolioTransitionSerial) {
      portfolioInteractionLocked = false;
      interactionList?.removeAttribute("aria-busy");
      schedulePortfolioStickyUpdate();
      settleRetainedViewportHeight(retentionSerial);
      const pending = pendingPortfolioSection;
      pendingPortfolioSection = null;
      if (!transition.canceled && pending?.isConnected) {
        window.requestAnimationFrame(() => togglePortfolioSection(pending));
      }
    }
  }
}

function updatePortfolioNavigation() {
  if (!portfolioNav || !portfolioList) return;
  const expanded = portfolioSections.some((section) => section.open);
  portfolioList.classList.toggle("portfolio-list--expanded", expanded);
  portfolioList.style.setProperty("--portfolio-nav-height", `${expanded ? portfolioNav.offsetHeight : 0}px`);
  activityList?.classList.toggle("activity-list--expanded", activitySections.some((section) => section.open));

  document.querySelectorAll(".portfolio-sublist").forEach((sublist) => {
    const nav = sublist.querySelector(":scope > .portfolio-subnav");
    if (!nav) return;
    const opened = !!nav.querySelector(".portfolio-subcard[open]");
    sublist.classList.toggle("portfolio-sublist--expanded", opened);
    sublist.style.setProperty("--portfolio-subnav-height", `${opened ? nav.offsetHeight : 0}px`);
  });
}

const portfolioNavigationObserver = new ResizeObserver(updatePortfolioNavigation);

function schedulePortfolioStickyUpdate() {
  if (portfolioStickyFrame) return;
  portfolioStickyFrame = window.requestAnimationFrame(() => {
    portfolioStickyFrame = 0;
    updatePortfolioNavigation();
  });
}

window.addEventListener("resize", schedulePortfolioStickyUpdate);
window.addEventListener("scroll", scheduleRetainedViewportTailUpdate, { passive: true });
window.addEventListener("resize", scheduleRetainedViewportTailUpdate);

function getPortfolioFollowingElements() {
  const followingElements = [];
  const artPracticeSection = portfolioList?.closest(".cv-group");
  let followingSection = artPracticeSection?.nextElementSibling;

  while (followingSection) {
    followingElements.push(followingSection);
    followingSection = followingSection.nextElementSibling;
  }

  const footer = document.querySelector(".resume-footer");
  if (footer) followingElements.push(footer);

  return followingElements;
}

function getPortfolioMotionElements() {
  return [
    ...portfolioSections,
    ...activitySections,
    ...getPortfolioFollowingElements(),
  ];
}

function capturePortfolioPositions(elements = getPortfolioMotionElements()) {
  return new Map(
    elements.map((element) => {
      const summary = element.matches(
        ".paper-card, .portfolio-card, .portfolio-subcard, .activity-group",
      )
        ? element.querySelector(":scope > summary")
        : null;

      return [
        element,
        {
          rect: element.getBoundingClientRect(),
          summaryRect: summary?.getBoundingClientRect() || null,
          titleFontSize: element.matches(".paper-card, .activity-group") && summary
            ? Number.parseFloat(getComputedStyle(summary.firstElementChild).fontSize)
              * new DOMMatrix(getComputedStyle(summary).transform).a
            : null,
        },
      ];
    }),
  );
}

function animatePortfolioLayout(
  previousPositions,
  elements = getPortfolioMotionElements(),
) {
  if (prefersReducedMotion.matches) return Promise.resolve();

  const animations = [];

  elements.forEach((element) => {
    const previous = previousPositions.get(element);
    if (!previous) return;

    const summary = element.matches(
      ".paper-card, .portfolio-card, .portfolio-subcard, .activity-group",
    )
      ? element.querySelector(":scope > summary")
      : null;
    const animatedElement = summary || element;
    const previousRect = previous.summaryRect || previous.rect;
    if (!previousRect.width && !previousRect.height) return;
    const current = animatedElement.getBoundingClientRect();
    if (!current.width || !current.height) return;

    const deltaX = previousRect.left - current.left;
    const deltaY = previousRect.top - current.top;
    const scale = previous.titleFontSize && summary
      ? previous.titleFontSize / Number.parseFloat(getComputedStyle(summary.firstElementChild).fontSize)
      : 1;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1 && Math.abs(scale - 1) < 0.01) return;

    portfolioMovementAnimations.get(animatedElement)?.cancel();

    const movement = animatedElement.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scale})`, transformOrigin: "top left" },
        { transform: "translate(0, 0) scale(1)", transformOrigin: "top left" },
      ],
      {
        duration: portfolioTransitionDuration,
        easing: "cubic-bezier(0.45, 0, 0.2, 1)",
      },
    );
    portfolioMovementAnimations.set(animatedElement, movement);

    animations.push(
      movement.finished
        .catch(() => undefined)
        .finally(() => {
          if (portfolioMovementAnimations.get(animatedElement) === movement) {
            portfolioMovementAnimations.delete(animatedElement);
            schedulePortfolioStickyUpdate();
          }
        }),
    );
  });

  return Promise.all(animations);
}

function runActivityTransition(previousPositions, elements, targetSection) {
  const transitionSerial = ++activityTransitionSerial;
  activeActivityTarget = targetSection;
  activityInteractionLocked = true;
  activityList?.setAttribute("aria-busy", "true");

  return animatePortfolioLayout(previousPositions, elements).finally(() => {
    if (transitionSerial !== activityTransitionSerial) return;

    activityInteractionLocked = false;
    activeActivityTarget = null;
    activityList?.removeAttribute("aria-busy");

    const pendingSection = pendingActivitySection;
    pendingActivitySection = null;
    if (pendingSection) toggleActivitySection(pendingSection);
  });
}

function revealPortfolioElement(element) {
  if (prefersReducedMotion.matches) return;
  if (!element) return;

  element.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 300,
    delay: 100,
    easing: "ease-out",
    fill: "both",
  });
}

function getPaperBody(section) {
  const localBody = section.querySelector(":scope > .paper-card__abstract");
  if (localBody) return localBody;
  const stagedBody = paperStage?.querySelector(":scope > .paper-card__abstract");
  return stagedBody && paperBodyOwners.get(stagedBody) === section ? stagedBody : null;
}

function restoreStagedPaperBody(section = null) {
  const body = paperStage?.querySelector(":scope > .paper-card__abstract");
  const owner = body && paperBodyOwners.get(body);
  if (!owner || (section && owner !== section)) return;
  owner.append(body);
  paperStage.removeAttribute("aria-label");
}

function movePaperBodyToStage(section) {
  const body = getPaperBody(section);
  if (!body || !paperStage) return;
  restoreStagedPaperBody();
  paperStage.replaceChildren(body);
  paperStage.setAttribute(
    "aria-label",
    section.querySelector(":scope > summary")?.textContent.trim() || "论文摘要",
  );
}

function updatePaperNavigation() {
  paperList?.classList.toggle(
    "paper-list--expanded",
    paperSections.some((section) => section.open),
  );
}

function togglePaperSection(section) {
  if (suppressSchoolNavigation) return;
  if (section.open) {
    if (isAccidentalEarlyClose(section)) return;
    startAnimatedCollapse(section, [...paperSections, ...getPortfolioMotionElements()]);
    return;
  }

  const retentionSerial = prepareExpandableToggle(section);
  const previousPositions = capturePortfolioPositions(paperSections);
  const switching = paperSections.some((other) => other.open);
  // Transfer the bar before closing the old paper so switches stay opaque.
  showStickyBar(paperNav, section, !switching);
  closeOtherExpandableSections(section);
  section.open = true;
  markSectionOpened(section);
  section.classList.add("paper-card--active");
  movePaperBodyToStage(section);
  updatePaperNavigation();
  const titleMovement = animatePortfolioLayout(previousPositions, paperSections);
  const navigationScroll = scrollNavigationToTop(paperList);
  revealPortfolioElement(getPaperBody(section));
  Promise.all([titleMovement, navigationScroll]).finally(() => {
    settleRetainedViewportHeight(retentionSerial);
  });
}

if (paperList) {
  paperNav = document.createElement("div");
  paperNav.className = "paper-nav";
  paperNav.setAttribute("aria-label", "论文导航");
  paperList.prepend(paperNav);

  paperSections.forEach((section) => {
    const body = section.querySelector(":scope > .paper-card__abstract");
    if (body) paperBodyOwners.set(body, section);
    paperNav.append(section);

    section.querySelector(":scope > summary")?.addEventListener("click", (event) => {
      if (suppressSchoolNavigation) return;
      event.preventDefault();
      togglePaperSection(section);
    });

    section.addEventListener("toggle", () => {
      if (suppressSchoolNavigation) return;
      if (!section.open) {
        restoreStagedPaperBody(section);
        section.classList.remove("paper-card--active");
        updatePaperNavigation();
      }
    });
  });

  paperStage = document.createElement("div");
  paperStage.className = "paper-stage";
  paperStage.setAttribute("role", "region");
  paperStage.setAttribute("aria-live", "polite");
  paperList.append(paperStage);
}

if (portfolioList) {
  const activityZone = portfolioList.querySelector(":scope > #art-activities");
  portfolioNav = document.createElement("div");
  portfolioNav.className = "portfolio-nav";
  portfolioNav.setAttribute("aria-label", "作品导航");
  portfolioList.insertBefore(portfolioNav, activityZone);

  portfolioSections
    .map((section, index) => ({ section, index, year: getPortfolioYear(section) }))
    .sort((a, b) => b.year - a.year || a.index - b.index)
    .forEach(({ section }) => portfolioNav.append(section));
  portfolioNavigationObserver.observe(portfolioNav);

  portfolioStage = document.createElement("div");
  portfolioStage.className = "portfolio-stage";
  portfolioStage.setAttribute("role", "region");
  portfolioStage.setAttribute("aria-live", "polite");
  portfolioList.insertBefore(portfolioStage, activityZone);
}

if (activityList) {
  activityNav = document.createElement("div");
  activityNav.className = "activity-nav";
  activityNav.setAttribute("aria-label", "展览与项目导航");
  activityList.prepend(activityNav);
  activitySections.forEach((section) => {
    const body = section.querySelector(":scope > .activity-group__body");
    if (body) activityBodyOwners.set(body, section);
    activityNav.append(section);
  });
  portfolioNavigationObserver.observe(activityNav);

  activityStage = document.createElement("div");
  activityStage.className = "activity-stage";
  activityStage.setAttribute("role", "region");
  activityStage.setAttribute("aria-live", "polite");
  activityList.append(activityStage);
}

function fitEmbeddedPage(frame) {
  const viewport = frame.closest(".baike-window__viewport");
  if (!viewport) return;

  const browserWidth = document.documentElement.clientWidth;
  // Pre-set dimensions even before a closed card has a background layout box.
  const visibleWidth = viewport.clientWidth
    || Math.max(1, (frame.closest("#education")?.clientWidth || browserWidth) - 2);
  const visibleHeight = viewport.clientHeight
    || Number.parseFloat(getComputedStyle(viewport).height)
    || 360;
  const sourceWidth = Math.max(visibleWidth, browserWidth);
  const scale = Math.min(1, visibleWidth / sourceWidth);

  frame.style.width = `${sourceWidth}px`;
  frame.style.height = `${Math.ceil(visibleHeight / scale)}px`;
  frame.style.transform = `scale(${scale})`;
}

function clearEmbeddedPageLoadingTimers(frame) {
  const timers = embeddedPageLoadingTimers.get(frame);
  if (!timers) return;
  window.clearTimeout(timers.preview);
  window.clearTimeout(timers.slow);
  embeddedPageLoadingTimers.delete(frame);
}

function releaseEmbeddedPagePreview(frame) {
  const viewport = frame.closest(".baike-window__viewport");
  if (!viewport) return;
  viewport.classList.add("is-preview-released");
  if (viewport.classList.contains("is-loading") && !viewport.classList.contains("is-loading-slow")) {
    viewport.querySelector(".baike-loading__text").textContent = "页面继续加载中…";
  }
}

function loadEmbeddedPage(frame) {
  fitEmbeddedPage(frame);
  if (!frame.dataset.src) return;

  const viewport = frame.closest(".baike-window__viewport");
  if (viewport) {
    if (!viewport.querySelector(".baike-loading")) {
      const loader = document.createElement("div");
      loader.className = "baike-loading";
      loader.setAttribute("role", "status");
      loader.setAttribute("aria-live", "polite");
      const spinner = document.createElement("span");
      spinner.className = "baike-loading__spinner";
      spinner.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "baike-loading__text";
      text.textContent = "正在加载百度百科…";
      loader.append(spinner, text);
      viewport.append(loader);
    }
    viewport.classList.add("is-loading");
    viewport.classList.remove("is-loaded", "is-preview-released", "is-loading-slow", "is-loading-error");
    viewport.setAttribute("aria-busy", "true");
    viewport.querySelector(".baike-loading").removeAttribute("aria-hidden");
    viewport.querySelector(".baike-loading__text").textContent = "正在加载百度百科…";
    clearEmbeddedPageLoadingTimers(frame);
    // A cross-origin iframe cannot report DOM readiness to this page without
    // cooperation from Baidu. Hand off the preview early, but keep loading
    // separate: only the iframe's load event marks the page as finished.
    embeddedPageLoadingTimers.set(frame, {
      preview: window.setTimeout(() => releaseEmbeddedPagePreview(frame), embeddedPagePreviewDelay),
      slow: window.setTimeout(() => {
        viewport.classList.add("is-loading-slow");
        viewport.querySelector(".baike-loading__text").textContent = "加载较慢，可点击上方“打开原页”查看";
      }, 15000),
    });
  }

  frame.src = frame.dataset.src;
  frame.removeAttribute("data-src");
}

embeddedPages.forEach((frame) => {
  frame.addEventListener("load", () => {
    fitEmbeddedPage(frame);
    // Ignore the iframe's initial empty document before lazy loading starts.
    if (frame.dataset.src) return;
    clearEmbeddedPageLoadingTimers(frame);
    const viewport = frame.closest(".baike-window__viewport");
    viewport?.classList.remove("is-loading", "is-loading-slow", "is-loading-error");
    viewport?.classList.add("is-loaded", "is-preview-released");
    viewport?.setAttribute("aria-busy", "false");
    viewport?.querySelector(".baike-loading")?.setAttribute("aria-hidden", "true");
  });
  frame.addEventListener("error", () => {
    clearEmbeddedPageLoadingTimers(frame);
    const viewport = frame.closest(".baike-window__viewport");
    viewport?.classList.remove("is-loading", "is-loading-slow", "is-loaded");
    viewport?.classList.add("is-loading-error", "is-preview-released");
    viewport?.setAttribute("aria-busy", "false");
    viewport?.querySelector(".baike-loading")?.removeAttribute("aria-hidden");
    const text = viewport?.querySelector(".baike-loading__text");
    if (text) text.textContent = "暂时无法加载，可点击上方“打开原页”查看";
  });
});

if ("ResizeObserver" in window) {
  const embeddedPageObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const frame = entry.target.querySelector("iframe");
      if (frame) fitEmbeddedPage(frame);
    });
  });

  document.querySelectorAll(".baike-window__viewport").forEach((viewport) => {
    embeddedPageObserver.observe(viewport);
  });
}

window.addEventListener("resize", () => {
  embeddedPages.forEach(fitEmbeddedPage);
});

function collectBackgroundImages() {
  const groups = [];
  portfolioSections.slice().sort((a, b) => getPortfolioYear(b) - getPortfolioYear(a))
    .forEach((section) => {
      const scope = section.querySelector(":scope > .portfolio-card__template")?.content
        || getPortfolioBody(section);
      if (!scope) return;
      if (section.dataset.portfolioTail === "true") {
        const substage = scope.querySelector(".portfolio-substage");
        scope.querySelectorAll(".portfolio-subcard").forEach((subcard) => {
          const body = getPortfolioSubBody(subcard, substage);
          if (body) groups.push([...body.querySelectorAll("img[src]")]);
        });
      } else {
        groups.push([...scope.querySelectorAll("img[src]")]);
      }
    });
  groups.push([...document.querySelectorAll("#ongoing-projects img[src]")]);

  const sources = new Map();
  const animations = [];
  const add = (image) => {
    const src = new URL(image.getAttribute("src"), document.baseURI).href;
    if (sources.has(src)) return;
    sources.set(src, {
      src,
      fallbackSrc: image.dataset.fallbackSrc
        ? new URL(image.dataset.fallbackSrc, document.baseURI).href : null,
    });
  };
  // Round-robin covers first; larger animated images with poster fallbacks last.
  const longest = Math.max(0, ...groups.map((images) => images.length));
  for (let index = 0; index < longest; index += 1) {
    groups.forEach((images) => {
      const image = images[index];
      if (!image) return;
      if (image.dataset.fallbackSrc) animations.push(image);
      else add(image);
    });
  }
  animations.forEach(add);
  return [...sources.values()];
}

function preloadBackgroundImage(source) {
  if ([...document.images].some((image) => image.complete && image.naturalWidth > 0
    && (image.currentSrc || image.src) === source.src)) return Promise.resolve();

  return new Promise((resolve) => {
    const image = new Image();
    let fallbackSrc = source.fallbackSrc;
    image.decoding = "async";
    image.fetchPriority = "low";
    const finish = () => {
      image.onload = null;
      image.onerror = null;
      resolve();
    };
    image.onload = finish;
    image.onerror = () => {
      if (!fallbackSrc) {
        finish();
        return;
      }
      const fallback = fallbackSrc;
      fallbackSrc = null;
      image.src = fallback;
    };
    // Use the browser's normal image cache. Do not clone work details, create
    // object URLs, or retain every decoded image in JavaScript memory.
    image.src = source.src;
  });
}

function clearBackgroundSchoolBody(body) {
  const previous = body && backgroundSchoolBodies.get(body);
  if (!previous) return;
  body.classList.remove("school-card__body--background-loading");
  body.style.removeProperty("--school-background-width");
  body.inert = previous.inert;
  backgroundSchoolBodies.delete(body);
}

function preloadBackgroundPage(frame) {
  // A user may already have opened this school before its queue turn.
  if (!frame.dataset.src) return Promise.resolve();
  const body = frame.closest(".school-card__body");
  const owner = body && schoolBodyOwners.get(body);
  if (body && owner && !owner.open) {
    // Render offscreen, rather than display:none: Baidu's responsive scripts
    // need a real viewport. Keep the original iframe and exclude the hidden
    // body from focus/accessibility until it is opened or finishes loading.
    backgroundSchoolBodies.set(body, { inert: body.inert });
    body.inert = true;
    body.style.setProperty("--school-background-width", `${body.closest("#education").clientWidth}px`);
    body.classList.add("school-card__body--background-loading");
  }
  return new Promise((resolve) => {
    const finish = () => {
      frame.removeEventListener("load", finish);
      frame.removeEventListener("error", finish);
      clearBackgroundSchoolBody(body);
      resolve();
    };
    frame.addEventListener("load", finish);
    frame.addEventListener("error", finish);
    loadEmbeddedPage(frame);
  });
}

function hasForegroundMediaLoading() {
  if (schoolSections.some((section) => section.open
    && getSchoolBody(section)?.querySelector(".baike-window__viewport.is-loading"))) return true;

  return [...document.querySelectorAll(".portfolio-stage img, #ongoing-projects .portfolio-subcard[open] img")]
    .some((image) => {
      if (image.complete || image.getClientRects().length === 0) return false;
      if (image.loading !== "lazy") return true;
      const rect = image.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= window.innerHeight + 300;
    });
}

function scheduleBackgroundMediaLoading(delay = 150) {
  const state = backgroundMediaLoading;
  if (!state.started || state.scheduled || (!state.images.length && !state.pages.length)) return;
  state.scheduled = true;
  window.setTimeout(() => {
    const run = () => {
      state.scheduled = false;
      drainBackgroundMediaLoading();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1000 });
    } else {
      run();
    }
  }, delay);
}

function drainBackgroundMediaLoading() {
  const state = backgroundMediaLoading;
  // Let foreground interactions finish; hidden/offline pages resume on events.
  if (document.hidden || !navigator.onLine) return;
  if (suppressSchoolNavigation || activeCollapse || portfolioInteractionLocked
    || activityInteractionLocked || hasForegroundMediaLoading()) {
    scheduleBackgroundMediaLoading(500);
    return;
  }
  if (!state.imageActive && state.images.length) {
    state.imageActive = true;
    preloadBackgroundImage(state.images.shift()).catch(() => undefined).finally(() => {
      state.imageActive = false;
      scheduleBackgroundMediaLoading();
    });
  }
  if (!state.pageActive && state.pages.length) {
    state.pageActive = true;
    preloadBackgroundPage(state.pages.shift()).catch(() => undefined).finally(() => {
      state.pageActive = false;
      scheduleBackgroundMediaLoading();
    });
  }
}

function startBackgroundMediaLoading() {
  const state = backgroundMediaLoading;
  if (state.started || navigator.connection?.saveData) return;
  state.started = true;
  state.images = collectBackgroundImages();
  state.pages = embeddedPages.slice();
  // The initial text/portrait load first. Background work begins on an idle
  // turn after a short head start for reading, not during HTML parsing.
  scheduleBackgroundMediaLoading(1000);
}

if (document.readyState === "complete") startBackgroundMediaLoading();
else window.addEventListener("load", startBackgroundMediaLoading, { once: true });
document.addEventListener("visibilitychange", () => scheduleBackgroundMediaLoading());
window.addEventListener("online", () => scheduleBackgroundMediaLoading());

function prioritizePortfolioImages(scope) {
  scope.querySelectorAll("img").forEach((image) => {
    if (image.closest(".portfolio-subcard:not([open])")) return;
    image.loading = "eager";
    image.fetchPriority = "high";
  });
}

function loadPortfolioProject(section) {
  if (section.dataset.loaded === "true") return;

  const template = section.querySelector(":scope > .portfolio-card__template");
  if (!template) return;

  const projectContent = template.content.cloneNode(true);
  prioritizePortfolioImages(projectContent);

  const body = projectContent.querySelector(".portfolio-card__body");
  if (body) portfolioBodyOwners.set(body, section);
  setupImageZoom(projectContent);

  section.append(projectContent);
  template.remove();
  section.dataset.loaded = "true";
  if (body) ensureWorkPresentation(section, body);
  setupPortfolioSublists(section);
}

function ensureWorkName(section) {
  const label = section.querySelector(":scope > summary > span");
  if (!label || !label.querySelector(".portfolio-work__year")) return null;
  let name = label.querySelector(".portfolio-work__name");
  if (!name) {
    name = document.createElement("span");
    name.className = "portfolio-work__name";
    name.textContent = [...label.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent).join("").trim();
    [...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => node.remove());
    label.prepend(name, document.createTextNode(" "));
  }
  return name;
}

function ensureWorkPresentation(section, body) {
  const name = ensureWorkName(section);
  const meta = body.querySelector(":scope > .portfolio-card__intro > .portfolio-card__meta");
  if (!name || !meta || body.querySelector(":scope > .portfolio-work__heading")) return;

  const heading = document.createElement("h3");
  heading.className = "portfolio-work__heading";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "portfolio-work__title";
  button.textContent = name.textContent;
  button.setAttribute("aria-label", `收起作品：${name.textContent}`);
  button.addEventListener("click", () => section.querySelector(":scope > summary")?.click());
  heading.append(button);
  body.prepend(heading);

  const year = document.createElement("span");
  year.className = "portfolio-work__meta-year";
  year.textContent = meta.textContent.match(/^\d{4}/)?.[0] || "";
  const remainder = meta.textContent.slice(year.textContent.length);
  meta.replaceChildren(year, document.createTextNode(remainder));
  section.dataset.workPresentation = "true";
}

function captureWorkPresentation(section, expanded = false) {
  const body = expanded ? getExpandableBody(section) : null;
  const title = expanded ? body?.querySelector(".portfolio-work__title") : ensureWorkName(section);
  const year = expanded ? body?.querySelector(".portfolio-work__meta-year")
    : section.querySelector(":scope > summary .portfolio-work__year");
  return [title, year].map((element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { rect, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) };
  });
}

function cancelWorkPresentation(section) {
  workPresentationAnimations.get(section)?.cancel();
}

function animateWorkPresentation(section, previous, expanded = true) {
  cancelWorkPresentation(section);
  if (prefersReducedMotion.matches || !previous) return;
  const body = expanded ? getExpandableBody(section) : null;
  const targets = expanded
    ? [body?.querySelector(".portfolio-work__title"), body?.querySelector(".portfolio-work__meta-year")]
    : [ensureWorkName(section), section.querySelector(":scope > summary .portfolio-work__year")];
  const flights = [];
  const layer = document.createElement("div");
  layer.className = "portfolio-work__flight-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  const transition = { cancel: null, frame: 0 };
  transition.cancel = () => {
    window.cancelAnimationFrame(transition.frame);
    flights.forEach(({ animation, ghost, target, visibility }) => {
      animation.cancel();
      ghost.remove();
      target.style.visibility = visibility;
    });
    layer.remove();
    if (workPresentationAnimations.get(section) === transition) {
      workPresentationAnimations.delete(section);
    }
  };
  workPresentationAnimations.set(section, transition);

  targets.forEach((target, index) => {
    const from = previous[index];
    if (!target || !from?.rect.width || !from.rect.height) return;
    const to = target.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const style = getComputedStyle(target);
    const ghost = document.createElement("span");
    ghost.className = "portfolio-work__flight";
    ghost.textContent = target.textContent;
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      left: `${to.left}px`, top: `${to.top}px`,
      fontFamily: style.fontFamily, fontSize: style.fontSize,
      fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color,
    });
    layer.append(ghost);
    const visibility = target.style.visibility;
    target.style.visibility = "hidden";
    const scale = from.fontSize / Number.parseFloat(style.fontSize);
    const animation = ghost.animate([
      { transform: `translate(${from.rect.left - to.left}px, ${from.rect.top - to.top}px) scale(${scale})`, opacity: 1 },
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
    ], { duration: portfolioTransitionDuration, easing: "cubic-bezier(0.45, 0, 0.2, 1)" });
    flights.push({ animation, ghost, target, visibility });
  });
  const followScroll = () => {
    flights.forEach(({ ghost, target }) => {
      const rect = target.getBoundingClientRect();
      ghost.style.top = `${rect.top}px`;
      ghost.style.left = `${rect.left}px`;
    });
    transition.frame = window.requestAnimationFrame(followScroll);
  };
  transition.frame = window.requestAnimationFrame(followScroll);
  Promise.all(flights.map(({ animation }) => animation.finished.catch(() => undefined)))
    .then(() => {
      if (workPresentationAnimations.get(section) === transition) transition.cancel();
    });
}

portfolioSections.forEach(ensureWorkName);

function getPortfolioBody(section) {
  const localBody = section.querySelector(":scope > .portfolio-card__body");
  if (localBody) return localBody;

  const stagedBody = portfolioStage?.querySelector(":scope > .portfolio-card__body");
  return stagedBody && portfolioBodyOwners.get(stagedBody) === section
    ? stagedBody
    : null;
}

function movePortfolioBodyToStage(section) {
  const body = getPortfolioBody(section);
  if (!body || !portfolioStage) return;

  portfolioStage.replaceChildren(body);
  if (section.dataset.workPresentation === "true") section.classList.add("portfolio-work--presented");
  updatePortfolioNavigation();
  portfolioStage.setAttribute(
    "aria-label",
    section.querySelector(":scope > summary")?.textContent.trim() || "作品详情",
  );
}

function restoreStagedPortfolioBody(section = null) {
  const body = portfolioStage?.querySelector(":scope > .portfolio-card__body");
  if (!body) return;

  const owner = portfolioBodyOwners.get(body);
  if (!owner || (section && owner !== section)) return;

  owner.append(body);
  portfolioStage.removeAttribute("aria-label");
}

function getPortfolioSubBody(subcard, substage) {
  const localBody = subcard.querySelector(":scope > .portfolio-subcard__body");
  if (localBody) return localBody;

  const stagedBody = substage.querySelector(":scope > .portfolio-subcard__body");
  return stagedBody && portfolioSubBodyOwners.get(stagedBody) === subcard
    ? stagedBody
    : null;
}

function movePortfolioSubBodyToStage(subcard, substage) {
  const body = getPortfolioSubBody(subcard, substage);
  if (!body) return;

  substage.replaceChildren(body);
  if (subcard.dataset.workPresentation === "true") subcard.classList.add("portfolio-work--presented");
  updatePortfolioNavigation();
  substage.setAttribute(
    "aria-label",
    subcard.querySelector(":scope > summary")?.textContent.trim() || "作品详情",
  );
}

function restorePortfolioSubstage(sublist, subcard = null) {
  const substage = sublist.querySelector(":scope > .portfolio-substage");
  const body = substage?.querySelector(":scope > .portfolio-subcard__body");
  if (!body) return;

  const owner = portfolioSubBodyOwners.get(body);
  if (!owner || (subcard && owner !== subcard)) return;

  owner.append(body);
  substage.removeAttribute("aria-label");
}

function restoreAllPortfolioSubstages() {
  document.querySelectorAll(".portfolio-sublist").forEach((sublist) => {
    restorePortfolioSubstage(sublist);
  });
}

function getActivityBody(section) {
  const localBody = section.querySelector(":scope > .activity-group__body");
  if (localBody) return localBody;

  const stagedBody = activityStage?.querySelector(":scope > .activity-group__body");
  return stagedBody && activityBodyOwners.get(stagedBody) === section
    ? stagedBody
    : null;
}

function moveActivityBodyToStage(section) {
  const body = getActivityBody(section);
  if (!body || !activityStage) return;

  activityStage.replaceChildren(body);
  activityStage.setAttribute(
    "aria-label",
    section.querySelector(":scope > summary")?.textContent.trim() || "艺术活动详情",
  );
}

function restoreStagedActivityBody(section = null) {
  const body = activityStage?.querySelector(":scope > .activity-group__body");
  if (!body) return;

  const owner = activityBodyOwners.get(body);
  if (!owner || (section && owner !== section)) return;

  owner.append(body);
  activityStage.removeAttribute("aria-label");
}

function getActivityMotionElements() {
  const followingElements = [];
  const artActivitiesSection = activityList?.closest(".cv-group");
  let followingSection = artActivitiesSection?.nextElementSibling;

  while (followingSection) {
    followingElements.push(followingSection);
    followingSection = followingSection.nextElementSibling;
  }

  const footer = document.querySelector(".resume-footer");
  if (footer) followingElements.push(footer);

  return [
    ...portfolioSections,
    ...activitySections,
    ...(portfolioStage ? [portfolioStage] : []),
    ...followingElements,
  ];
}

function getPortfolioSubMotionElements(sublist) {
  const followingElements = [];
  let followingSection = sublist.closest(".cv-group")?.nextElementSibling;
  while (followingSection) {
    followingElements.push(followingSection);
    followingSection = followingSection.nextElementSibling;
  }
  const footer = document.querySelector(".resume-footer");
  if (footer) followingElements.push(footer);

  return [
    ...sublist.querySelectorAll(":scope > .portfolio-subnav > .portfolio-subcard"),
    ...followingElements,
  ];
}

function setupPortfolioSublists(scope) {
  scope.querySelectorAll(".portfolio-sublist").forEach((sublist) => {
    if (initializedPortfolioSublists.has(sublist)) return;

    const substage = sublist.querySelector(":scope > .portfolio-substage");
    const subcards = Array.from(
      sublist.querySelectorAll(":scope > .portfolio-subcard"),
    );
    if (!substage) return;

    const subnav = document.createElement("div");
    subnav.className = "portfolio-subnav";
    subnav.setAttribute("aria-label", sublist.getAttribute("aria-label") || "更多作品导航");
    sublist.insertBefore(subnav, substage);
    subcards.forEach((subcard) => subnav.append(subcard));
    portfolioNavigationObserver.observe(subnav);

    initializedPortfolioSublists.add(sublist);

    subcards.forEach((subcard) => {
      const body = subcard.querySelector(":scope > .portfolio-subcard__body");
      if (body) {
        portfolioSubBodyOwners.set(body, subcard);
        ensureWorkPresentation(subcard, body);
      }

      const summary = subcard.querySelector(":scope > summary");
      summary?.addEventListener("click", (event) => {
        if (suppressSchoolNavigation) return;

        event.preventDefault();
        togglePortfolioSection(subcard);
      });

      subcard.addEventListener("toggle", () => {
        if (subcard.open) {
          closeOtherExpandableSections(subcard);
          return;
        }
        restorePortfolioSubstage(sublist, subcard);
        subcard.classList.remove("portfolio-subcard--active");
      });
    });

    const initiallyOpenSubcard = subcards.find((subcard) => subcard.open);
    if (initiallyOpenSubcard) {
      initiallyOpenSubcard.classList.add("portfolio-subcard--active");
      movePortfolioSubBodyToStage(initiallyOpenSubcard, substage);
    }
    updatePortfolioNavigation();
  });
}

setupPortfolioSublists(document.querySelector("#ongoing-projects"));

portfolioSections.forEach((section) => {
  if (section.open) loadPortfolioProject(section);

  const summary = section.querySelector(":scope > summary");

  summary?.addEventListener("click", (event) => {
    if (suppressSchoolNavigation) return;

    event.preventDefault();
    togglePortfolioSection(section);
  });

  section.addEventListener("toggle", () => {
    if (section.open) {
      loadPortfolioProject(section);
    } else {
      restoreStagedPortfolioBody(section);
      section.classList.remove("portfolio-card--active");
    }
  });
});

function toggleActivitySection(section) {
  if (suppressSchoolNavigation) {
    pendingActivitySection = null;
    return;
  }

  if (activityInteractionLocked) {
    pendingActivitySection = section === activeActivityTarget ? null : section;
    return;
  }

  const motionElements = getActivityMotionElements();

  if (section.open) {
    if (isAccidentalEarlyClose(section)) return;
    startAnimatedCollapse(section, motionElements);
    return;
  }

  const retentionSerial = prepareExpandableToggle(section);
  const previousPositions = capturePortfolioPositions(motionElements);
  const switching = activitySections.some((other) => other !== section && other.open);
  activitySections.forEach((otherSection) => {
    if (otherSection === section || !otherSection.open) return;
    restoreStagedActivityBody(otherSection);
    otherSection.open = false;
    otherSection.classList.remove("activity-group--active");
  });

  closeOtherExpandableSections(section);
  section.classList.add("activity-group--active");
  section.open = true;
  markSectionOpened(section);
  showStickyBar(activityNav, section, !switching);
  moveActivityBodyToStage(section);
  updatePortfolioNavigation();
  const layoutTransition = runActivityTransition(previousPositions, motionElements, section);
  const navigationScroll = scrollNavigationToTop(activityList);
  Promise.all([layoutTransition, navigationScroll]).finally(() => {
    settleRetainedViewportHeight(retentionSerial);
  });
  revealPortfolioElement(getActivityBody(section));
}

activitySections.forEach((section) => {
  const summary = section.querySelector(":scope > .activity-group__summary");

  summary?.addEventListener("click", (event) => {
    if (suppressSchoolNavigation) return;

    event.preventDefault();
    toggleActivitySection(section);
  });

  section.addEventListener("toggle", () => {
    if (suppressSchoolNavigation || section.open) return;
    restoreStagedActivityBody(section);
    section.classList.remove("activity-group--active");
  });

  if (section.open) {
    section.classList.add("activity-group--active");
    moveActivityBodyToStage(section);
  }
});

const schoolList = document.querySelector(".school-list");
const educationSection = schoolList?.closest("#education");
if (schoolList) {
  schoolSections.forEach((section) => {
    const body = section.querySelector(":scope > .school-card__body");
    if (body) schoolBodyOwners.set(body, section);
  });
  schoolStage = document.createElement("div");
  schoolStage.className = "school-stage";
  schoolStage.setAttribute("role", "region");
  educationSection.append(schoolStage);
}

function getSchoolBody(section) {
  const body = section.querySelector(":scope > .school-card__body");
  if (body) return body;
  const stagedBody = schoolStage?.querySelector(":scope > .school-card__body");
  return stagedBody && schoolBodyOwners.get(stagedBody) === section ? stagedBody : null;
}

function restoreStagedSchoolBody(section = null) {
  const body = schoolStage?.querySelector(":scope > .school-card__body");
  const owner = body && schoolBodyOwners.get(body);
  if (!owner || (section && owner !== section)) return;
  if (owner.moveBefore) owner.moveBefore(body, null);
  else owner.append(body);
  schoolStage.removeAttribute("aria-label");
  educationSection.classList.remove("education--expanded");
  schedulePortfolioStickyUpdate();
}

function moveSchoolBodyToStage(section) {
  const body = getSchoolBody(section);
  if (!body || !schoolStage) return;
  clearBackgroundSchoolBody(body);
  restoreStagedSchoolBody();
  if (schoolStage.moveBefore) schoolStage.moveBefore(body, null);
  else schoolStage.append(body);
  schoolStage.setAttribute("aria-label", section.querySelector(".school-card__name").textContent);
  educationSection.classList.add("education--expanded");
  schedulePortfolioStickyUpdate();
}

schoolSections.forEach((section) => {
  const summary = section.querySelector(":scope > summary");

  if (section.open) {
    moveSchoolBodyToStage(section);
    const frame = getSchoolBody(section)?.querySelector(".baike-window iframe");
    if (frame) loadEmbeddedPage(frame);
  }

  summary?.addEventListener("click", () => {
    if (!section.open && !suppressSchoolNavigation) {
      schoolScrollPositions.set(section, window.scrollY);
      showStickyBar(schoolList, section, !schoolSections.some((other) => other.open));
    }
  });

  section.addEventListener("toggle", () => {
    if (suppressSchoolNavigation) return;

    if (!section.open) {
      restoreStagedSchoolBody(section);
      if (automaticallyClosedSchools.has(section)) {
        automaticallyClosedSchools.delete(section);
        schoolScrollPositions.delete(section);
        return;
      }

      schoolScrollPositions.delete(section);
      return;
    }

    closeOtherExpandableSections(section);
    moveSchoolBodyToStage(section);
    const frame = getSchoolBody(section)?.querySelector(".baike-window iframe");
    if (frame) loadEmbeddedPage(frame);

    const retentionSerial = expansionRetentionSerials.get(section);
    window.requestAnimationFrame(() => {
      scrollNavigationToTop(educationSection).finally(() => {
        settleRetainedViewportHeight(retentionSerial);
      });
    });
  });
});

function getPortfolioParent(section) {
  if (!section.classList.contains("portfolio-subcard")) return null;

  const body = section.closest(".portfolio-card__body");
  return body ? portfolioBodyOwners.get(body) || null : null;
}

function closeExpandableSection(section) {
  if (!section.open) return;
  hideStickyBars(section);
  cancelWorkPresentation(section);
  section.classList.remove("portfolio-work--presented", "paper-card--active");
  expansionScrollPositions.delete(section);

  if (section.classList.contains("school-card")) {
    restoreStagedSchoolBody(section);
    automaticallyClosedSchools.add(section);
    schoolScrollPositions.delete(section);
  }

  if (section.classList.contains("paper-card")) {
    restoreStagedPaperBody(section);
  }

  if (section.classList.contains("portfolio-card")) {
    restoreStagedPortfolioBody(section);
    section.classList.remove("portfolio-card--active");
  }

  if (section.classList.contains("portfolio-subcard")) {
    const sublist = section.closest(".portfolio-sublist");
    if (sublist) restorePortfolioSubstage(sublist, section);
    section.classList.remove("portfolio-subcard--active");
  }

  if (section.classList.contains("activity-group")) {
    restoreStagedActivityBody(section);
    section.classList.remove("activity-group--active");
  }

  section.open = false;
  if (section.classList.contains("paper-card")) updatePaperNavigation();
  updatePortfolioNavigation();
}

function closeOtherExpandableSections(currentSection) {
  if (suppressSchoolNavigation) return;

  if (!currentSection.classList.contains("activity-group")) {
    pendingActivitySection = null;
  }

  const requiredParent = getPortfolioParent(currentSection);
  const expandableSections = document.querySelectorAll(
    ".school-card, .paper-card, .portfolio-card, .portfolio-subcard, .activity-group, details.cv-group",
  );

  expandableSections.forEach((otherSection) => {
    if (
      otherSection === currentSection ||
      otherSection === requiredParent ||
      otherSection.contains(currentSection)
    ) {
      return;
    }

    closeExpandableSection(otherSection);
  });
}

function retainViewportHeight() {
  // Keep only the height required by the current viewport, not a historical
  // maximum that retains every long expansion (and can accumulate rounding).
  window.cancelAnimationFrame(retainedViewportTailFrame);
  retainedViewportTailFrame = 0;
  retainedViewportTailActive = false;
  const { pageTop, bottomMargin } = getResumeHeightMetrics();
  const requiredHeight = Math.max(
    0,
    Math.floor(window.scrollY + window.innerHeight - pageTop - bottomMargin),
  );
  if (requiredHeight) {
    resumePage.style.minHeight = `${requiredHeight}px`;
  } else {
    resumePage.style.removeProperty("min-height");
  }
  viewportHeightRetentionSerial += 1;
  return viewportHeightRetentionSerial;
}

function getExpandableBody(section) {
  if (section.matches(".school-card")) return getSchoolBody(section);
  if (section.matches(".paper-card")) return getPaperBody(section);
  if (section.matches(".portfolio-card")) return getPortfolioBody(section);
  if (section.matches(".activity-group")) return getActivityBody(section);
  if (section.matches(".portfolio-subcard")) {
    const substage = section.closest(".portfolio-sublist")?.querySelector(":scope > .portfolio-substage");
    return substage ? getPortfolioSubBody(section, substage) : null;
  }
  return section.querySelector(":scope > .school-card__body, :scope > .paper-card__abstract, :scope > .cv-group__body");
}

function startAnimatedCollapse(section, motionElements = getPortfolioMotionElements()) {
  cancelPortfolioSwitch();
  if (activeCollapse?.section === section) return;
  activeCollapse?.finish(true);
  retainViewportHeight();

  const previousPosition = expansionScrollPositions.get(section) ?? window.scrollY;
  const body = getExpandableBody(section);
  if (!body) {
    closeExpandableSection(section);
    settleRetainedViewportHeight();
    return;
  }

  const startY = window.scrollY;
  const positions = capturePortfolioPositions(motionElements);
  const workPositions = section.classList.contains("portfolio-work--presented")
    ? captureWorkPresentation(section, true) : null;
  cancelWorkPresentation(section);
  const shell = document.createElement("div");
  shell.className = "collapse-shell";
  body.before(shell);
  if (shell.moveBefore) shell.moveBefore(body, null);
  else shell.append(body);
  const height = shell.getBoundingClientRect().height;
  shell.style.height = `${height}px`;
  shell.inert = true;
  // DOM relocation or making a focused detail inert can reset mobile scrolling.
  // Restore the viewport before measuring targets or painting the transition.
  window.scrollTo({ top: startY, behavior: "instant" });

  const main = resumePage.querySelector(":scope > main");
  const bottomMargin = Number.parseFloat(getComputedStyle(resumePage).marginBottom) || 0;
  // Leave room for the stage's row gap to disappear at final cleanup too.
  const finalMaxScroll = Math.max(0, main.getBoundingClientRect().bottom + startY + bottomMargin - height - 32 - window.innerHeight);
  const targetY = Math.min(Math.max(0, previousPosition), finalMaxScroll);
  const scrollDuration = prefersReducedMotion.matches ? 0 : 420;
  const contentDuration = prefersReducedMotion.matches ? 0 : 650;
  const collapse = { section, frame: 0, finish: null };
  activeCollapse = collapse;

  collapse.finish = (keepHeight = false) => {
    window.cancelAnimationFrame(collapse.frame);
    const workHeading = body.querySelector(":scope > .portfolio-work__heading");
    if (workHeading) workHeading.style.removeProperty("visibility");
    const workYear = body.querySelector(".portfolio-work__meta-year");
    if (workYear) workYear.style.removeProperty("visibility");
    // Restore the original node, not a clone, so nested works and listeners survive.
    if (shell.parentElement?.moveBefore) {
      shell.parentElement.moveBefore(body, shell);
      shell.remove();
    } else {
      shell.replaceWith(body);
    }
    closeExpandableSection(section);
    if (activeCollapse === collapse) activeCollapse = null;
    if (!keepHeight) settleRetainedViewportHeight();
    schedulePortfolioStickyUpdate();
  };

  section.classList.remove("paper-card--active", "portfolio-card--active", "portfolio-subcard--active", "activity-group--active");
  if (workPositions) {
    section.classList.remove("portfolio-work--presented");
    updatePortfolioNavigation();
    const summary = section.querySelector(":scope > summary");
    window.scrollTo({ top: startY, behavior: "instant" });
    animateWorkPresentation(section, workPositions, false);
    body.querySelector(".portfolio-work__heading").style.visibility = "hidden";
    body.querySelector(".portfolio-work__meta-year").style.visibility = "hidden";
  }
  animatePortfolioLayout(positions, motionElements);
  window.scrollTo({ top: startY, behavior: "instant" });
  const startedAt = performance.now();
  const advance = (now) => {
    const elapsed = now - startedAt;
    const scrollProgress = scrollDuration ? Math.min(1, elapsed / scrollDuration) : 1;
    const scrollEased = 1 - Math.pow(1 - scrollProgress, 3);
    const contentProgress = contentDuration ? Math.min(1, elapsed / contentDuration) : 1;
    // Slower take-off lets the upper area settle before the lower page catches up.
    const contentEased = contentProgress * contentProgress;
    shell.style.height = `${height * (1 - contentEased)}px`;
    shell.style.opacity = `${1 - contentProgress * contentProgress * (3 - 2 * contentProgress)}`;
    window.scrollTo({ top: startY + (targetY - startY) * scrollEased, behavior: "instant" });
    if (contentProgress < 1) {
      collapse.frame = window.requestAnimationFrame(advance);
    } else {
      collapse.finish();
    }
  };
  collapse.frame = window.requestAnimationFrame(advance);
}

function prepareExpandableToggle(section) {
  if (!resumePage || suppressSchoolNavigation) return;

  cancelPortfolioSwitch();
  activeCollapse?.finish(true);
  const retentionSerial = retainViewportHeight();
  expansionScrollPositions.set(section, window.scrollY);
  expansionRetentionSerials.set(section, retentionSerial);
  return retentionSerial;
}

function preservePageHeightBeforeToggle(event) {
  const summary = event.target.closest?.("summary");
  const section = summary?.parentElement;
  if (
    !section?.matches(
      ".school-card, details.cv-group",
    )
  ) {
    return;
  }

  if (section.open) {
    event.preventDefault();
    if (isAccidentalEarlyClose(section)) return;
    startAnimatedCollapse(section);
  } else {
    prepareExpandableToggle(section);
  }
}

document.addEventListener("click", preservePageHeightBeforeToggle, true);

secondarySections.forEach((section) => {
  section.addEventListener("toggle", () => {
    if (!section.open || suppressSchoolNavigation) return;
    markSectionOpened(section);
    closeOtherExpandableSections(section);

    if (section.matches("details.cv-group")) {
      const retentionSerial = expansionRetentionSerials.get(section);
      window.requestAnimationFrame(() => {
        scrollNavigationToTop(section).finally(() => {
          settleRetainedViewportHeight(retentionSerial);
        });
      });
    }
  });
});

function closePaperViewer() {
  if (!paperViewer) return;

  paperViewer.close();
}

function setupImageZoom(scope) {
  scope.querySelectorAll(".portfolio-card__images img").forEach((media) => {
    if (media.closest(".portfolio-image-trigger")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "portfolio-image-trigger";
    button.setAttribute("aria-label", `放大查看：${media.alt || media.getAttribute("aria-label")}`);
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "image-viewer");
    const ratio = media.style.getPropertyValue("--image-ratio");
    if (ratio) button.style.setProperty("--image-ratio", ratio);
    media.before(button);
    button.append(media);
  });
}

setupImageZoom(document.querySelector("#ongoing-projects"));

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.fallbackSrc) return;
  image.src = image.dataset.fallbackSrc;
  delete image.dataset.fallbackSrc;
}, true);

document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.(".portfolio-image-trigger");
  if (!trigger || !imageViewer || !imageViewerImage || suppressSchoolNavigation) return;
  const media = trigger.querySelector("img");
  if (!media) return;
  imageViewerImage.src = media.currentSrc || media.src;
  imageViewerImage.alt = media.alt;
  imageViewerImage.width = media.naturalWidth || media.width;
  imageViewerImage.height = media.naturalHeight || media.height;
  imageViewerScrollState = {
    y: window.scrollY,
    overflow: document.documentElement.style.overflow,
    gutter: document.documentElement.style.scrollbarGutter,
  };
  document.documentElement.style.scrollbarGutter = "stable";
  document.documentElement.style.overflow = "hidden";
  imageViewer.showModal();
});

imageViewer?.querySelector(".image-viewer__close")?.addEventListener("click", () => imageViewer.close());
imageViewer?.addEventListener("click", (event) => {
  if (!event.target.closest("button, img")) imageViewer.close();
});
imageViewer?.addEventListener("close", () => {
  if (imageViewerScrollState) {
    document.documentElement.style.overflow = imageViewerScrollState.overflow;
    document.documentElement.style.scrollbarGutter = imageViewerScrollState.gutter;
    window.scrollTo({ top: imageViewerScrollState.y, behavior: "instant" });
    imageViewerScrollState = null;
  }
  imageViewerImage.removeAttribute("src");
});

paperButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const source = button.dataset.paperSrc;
    if (!source) return;

    if (paperViewer && typeof paperViewer.showModal === "function") {
      if (paperViewerTitle) {
        paperViewerTitle.textContent = button.dataset.paperTitle || "论文全文";
      }
      if (paperViewerFrame) paperViewerFrame.src = source;
      if (paperViewerExternal) paperViewerExternal.href = source;
      paperViewer.showModal();
      return;
    }

    window.open(source, "_blank", "noopener,noreferrer");
  });
});

paperViewerClose?.addEventListener("click", closePaperViewer);

paperViewer?.addEventListener("click", (event) => {
  if (event.target === paperViewer) closePaperViewer();
});

paperViewer?.addEventListener("close", () => {
  if (!paperViewer.open && paperViewerFrame) {
    paperViewerFrame.removeAttribute("src");
  }
});

function expandForPrint() {
  cancelPortfolioSwitch();
  activeCollapse?.finish(true);
  suppressSchoolNavigation = true;
  document.querySelectorAll("[data-work-presentation]").forEach(cancelWorkPresentation);

  if (pageMinHeightBeforePrint === null && resumePage) {
    pageMinHeightBeforePrint = resumePage.style.minHeight;
    resumePage.style.removeProperty("min-height");
  }

  restoreStagedPortfolioBody();
  restoreStagedActivityBody();
  restoreStagedSchoolBody();
  restoreStagedPaperBody();
  embeddedPages.forEach(loadEmbeddedPage);
  portfolioSections.forEach(loadPortfolioProject);
  restoreAllPortfolioSubstages();

  const printableSections = Array.from(document.querySelectorAll("details"));

  if (stateBeforePrint === null) {
    stateBeforePrint = printableSections.map((item) => ({ item, open: item.open }));
  }

  printableSections.forEach((item) => {
    item.open = true;
  });
  prioritizePortfolioImages(document);
}

function restoreAfterPrint() {
  if (stateBeforePrint === null) return;

  stateBeforePrint.forEach(({ item, open }) => {
    item.open = open;
  });

  const openSchool = schoolSections.find((section) => section.open);
  if (openSchool) moveSchoolBodyToStage(openSchool);

  const openPaper = paperSections.find((section) => section.open);
  paperSections.forEach((section) => {
    section.classList.toggle("paper-card--active", section === openPaper);
  });
  if (openPaper) movePaperBodyToStage(openPaper);
  updatePaperNavigation();

  const openPortfolio = portfolioSections.find((section) => section.open);
  if (openPortfolio) movePortfolioBodyToStage(openPortfolio);

  activitySections.forEach((section) => {
    section.classList.toggle("activity-group--active", section.open);
  });
  const openActivity = activitySections.find((section) => section.open);
  if (openActivity) moveActivityBodyToStage(openActivity);

  document.querySelectorAll(".portfolio-sublist").forEach((sublist) => {
    const openSubcard = sublist.querySelector(
      ":scope > .portfolio-subnav > .portfolio-subcard[open]",
    );
    const substage = sublist.querySelector(":scope > .portfolio-substage");
    if (openSubcard && substage) {
      movePortfolioSubBodyToStage(openSubcard, substage);
    }
  });
  stateBeforePrint = null;
  if (resumePage) {
    if (pageMinHeightBeforePrint) {
      resumePage.style.minHeight = pageMinHeightBeforePrint;
    } else {
      resumePage.style.removeProperty("min-height");
    }
  }
  pageMinHeightBeforePrint = null;
  window.setTimeout(() => {
    suppressSchoolNavigation = false;
  }, 0);
}

downloadButton?.addEventListener("click", () => {
  expandForPrint();
  window.setTimeout(() => window.print(), 500);
});

window.addEventListener("beforeprint", expandForPrint);
window.addEventListener("afterprint", restoreAfterPrint);

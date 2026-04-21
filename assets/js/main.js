(function () {
  "use strict";

  // Removed legacy authFetch logic

  async function authFetch(url, options = {}) {
    // Backend-less version: just a regular fetch
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
      },
    });
    return res;
  }

  async function sessionCheck() {
    // Backend-less version: always valid
    console.log("session valid (serverless mode)");
    return true;
  }

  window.sessionCheck = sessionCheck;
  window.authFetch = authFetch;

  // function logout() {
  //   localStorage.removeItem("token");
  //   window.location.href = "login.html";
  // }
  async function logout() {
    console.log("Logout triggered (serverless mode)");
    // Clear local token too
    localStorage.removeItem("token");
    // In serverless mode, we don't necessarily need to redirect to login.html
    // but if the user wants to keep the flow:
    console.log("Redirect to login.html suppressed (serverless mode)");
  }
  window.logout = logout;

  function toggleScrolled() {
    const selectBody = document.querySelector("body");
    const selectHeader = document.querySelector("#header");
    if (
      !selectHeader.classList.contains("scroll-up-sticky") &&
      !selectHeader.classList.contains("sticky-top") &&
      !selectHeader.classList.contains("fixed-top")
    )
      return;
    window.scrollY > 100
      ? selectBody.classList.add("scrolled")
      : selectBody.classList.remove("scrolled");
  }

  document.addEventListener("scroll", toggleScrolled);
  window.addEventListener("load", toggleScrolled);

  /**
   * Mobile nav toggle
   */
  const mobileNavToggleBtn = document.querySelector(".mobile-nav-toggle");

  function mobileNavToogle() {
    document.querySelector("body").classList.toggle("mobile-nav-active");
    mobileNavToggleBtn.classList.toggle("bi-list");
    mobileNavToggleBtn.classList.toggle("bi-x");
  }
  if (mobileNavToggleBtn) {
    mobileNavToggleBtn.addEventListener("click", mobileNavToogle);
  }

  /**
   * Hide mobile nav on same-page/hash links
   */
  document.querySelectorAll("#navmenu a").forEach((navmenu) => {
    navmenu.addEventListener("click", () => {
      if (document.querySelector(".mobile-nav-active")) {
        mobileNavToogle();
      }
    });
  });

  /**
   * Toggle mobile nav dropdowns
   */
  document.querySelectorAll(".navmenu .toggle-dropdown").forEach((navmenu) => {
    navmenu.addEventListener("click", function (e) {
      e.preventDefault();
      this.parentNode.classList.toggle("active");
      this.parentNode.nextElementSibling.classList.toggle("dropdown-active");
      e.stopImmediatePropagation();
    });
  });

  /**
   * Scroll top button
   */
  let scrollTop = document.querySelector(".scroll-top");

  function toggleScrollTop() {
    if (scrollTop) {
      window.scrollY > 100
        ? scrollTop.classList.add("active")
        : scrollTop.classList.remove("active");
    }
  }
  // scrollTop.addEventListener('click', (e) => {
  //   e.preventDefault();
  //   window.scrollTo({
  //     top: 0,
  //     behavior: 'smooth'
  //   });
  // });

  window.addEventListener("load", toggleScrollTop);
  document.addEventListener("scroll", toggleScrollTop);

  /**
   * Animation on scroll function and init
   */
  function aosInit() {
    AOS.init({
      duration: 600,
      easing: "ease-in-out",
      once: true,
      mirror: false,
    });
  }
  window.addEventListener("load", aosInit);

  /**
   * Initiate Pure Counter
   */
  // new PureCounter();

  /**
   * Frequently Asked Questions Toggle
   */
  document
    .querySelectorAll(".faq-item h3, .faq-item .faq-toggle")
    .forEach((faqItem) => {
      faqItem.addEventListener("click", () => {
        faqItem.parentNode.classList.toggle("faq-active");
      });
    });

  /**
   * Init swiper sliders
   */
  function initSwiper() {
    document.querySelectorAll(".init-swiper").forEach(function (swiperElement) {
      let config = JSON.parse(
        swiperElement.querySelector(".swiper-config").innerHTML.trim()
      );

      if (swiperElement.classList.contains("swiper-tab")) {
        initSwiperWithCustomPagination(swiperElement, config);
      } else {
        new Swiper(swiperElement, config);
      }
    });
  }

  window.addEventListener("load", initSwiper);

  /**
   * Correct scrolling position upon page load for URLs containing hash links.
   */
  window.addEventListener("load", function (e) {
    if (window.location.hash) {
      if (document.querySelector(window.location.hash)) {
        setTimeout(() => {
          let section = document.querySelector(window.location.hash);
          let scrollMarginTop = getComputedStyle(section).scrollMarginTop;
          window.scrollTo({
            top: section.offsetTop - parseInt(scrollMarginTop),
            behavior: "smooth",
          });
        }, 100);
      }
    }
  });

  /**
   * Navmenu Scrollspy
   */
  let navmenulinks = document.querySelectorAll(".navmenu a");

  function navmenuScrollspy() {
    navmenulinks.forEach((navmenulink) => {
      if (!navmenulink.hash) return;
      let section = document.querySelector(navmenulink.hash);
      if (!section) return;
      let position = window.scrollY + 200;
      if (
        position >= section.offsetTop &&
        position <= section.offsetTop + section.offsetHeight
      ) {
        document
          .querySelectorAll(".navmenu a.active")
          .forEach((link) => link.classList.remove("active"));
        navmenulink.classList.add("active");
      } else {
        navmenulink.classList.remove("active");
      }
    });
  }
  window.addEventListener("load", navmenuScrollspy);
  document.addEventListener("scroll", navmenuScrollspy);
})();

document.querySelectorAll("table").forEach((tbl) => {
  const wrapper = document.createElement("div");
  wrapper.classList.add("table-responsive");
  tbl.parentNode.insertBefore(wrapper, tbl);
  wrapper.appendChild(tbl);
});

// document.addEventListener("DOMContentLoaded", () => {
//   const user = JSON.parse(localStorage.getItem("user"));
//   if (user && user.name) {
//     document.getElementById("engineerNameDisplay").textContent = user.name;
//   } else if (user && user.email) {
//     document.getElementById("engineerNameDisplay").textContent = user.email;
//   }

//   // Add CSS for submenu
//   const style = document.createElement("style");
//   style.textContent = `
//     .dropdown-submenu {
//       position: relative;
//     }
//     .dropdown-submenu .submenu {
//       display: none;
//       min-width: 200px;
//       z-index: 1050;
//       box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
//       border: 1px solid rgba(0, 0, 0, 0.15);
//       border-radius: 0.375rem;
//     }
//     .dropdown-submenu .dropdown-item.dropdown-toggle::after {
//       display: none;
//     }
//     .dropdown-submenu .dropdown-item.dropdown-toggle {
//       position: relative;
//       cursor: pointer;
//     }
//     .dropdown-submenu .dropdown-item.dropdown-toggle i {
//       position: absolute;
//       right: 10px;
//       top: 50%;
//       transform: translateY(-50%);
//       transition: transform 0.2s;
//     }
//     .dropdown-submenu.open .dropdown-item.dropdown-toggle i {
//       transform: translateY(-50%) rotate(180deg);
//     }
//     .admin-toggle i.fa-chevron-down {
//       transition: transform 0.2s;
//     }
//     .dropdown-submenu .submenu .dropdown-item {
//       padding: 0.375rem 1rem;
//     }
//   `;
//   document.head.appendChild(style);

//   if (user) {
//     const dropdownMenu = document.querySelector(
//       "#userDropdown ~ .dropdown-menu"
//     );
//     const role = user.role;
//     // alert(user.branch);

//     // let branch = user.branch[0].name;
//     // const planingBranch = "Mechanical";
//     // if (branch !== planingBranch) {
//     //   branch = "all";
//     // }

//     // const hasPlaningBranch = user.branch.some((b) => b.name === planingBranch);
//     // const branch = hasPlaningBranch ? planingBranch : "all";

//     const planingBranch = "Projects";
//     const excelBranch = "Excel";
//     // const branch =
//     //   !user.branch ||
//     //   user.branch.length === 0 ||
//     //   user.branch.some((b) => b.name === planingBranch)
//     //     ? planingBranch
//     //     : "all";

//     let branch = "all";

//     if (user.branch?.some((b) => b.name === excelBranch)) {
//       branch = excelBranch;
//     } else if (
//       !user.branch ||
//       user.branch.length === 0 ||
//       user.branch.some((b) => b.name === planingBranch)
//     ) {
//       branch = planingBranch;
//     }

//     // else {
//     //   branch = branch[0].name;
//     // }
//     // alert(branch);
//     const menuItems = [
//       {
//         roles: ["superadmin", "admin", "user"],
//         branches: [excelBranch],
//         label: "View/Update Excel",
//         href: "excel.html",
//       },
//       {
//         roles: ["superadmin", "admin", "user"],
//         branches: ["", planingBranch, excelBranch],
//         label: "Forecast Dashboard",
//         href: "forecastDashboard.html",
//       },
//       {
//         roles: ["superadmin", "admin", "user"],
//         branches: ["", planingBranch, excelBranch],
//         label: "Planning And Forecasting",
//         href: "plan.html",
//       },
//       {
//         roles: ["superadmin", "admin", "user", "customer"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "YD MOM",
//         href: "#",
//         target: "_blank",
//       },
//       // {
//       //   roles: ["superadmin", "admin", "user", "customer"],
//       //   label: "Weekly Meetings",
//       //   href: "meetings.html",
//       // },
//       {
//         roles: ["customer"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Weekly Meetings",
//         href: "meetings.html",
//       },
//       {
//         roles: ["superadmin", "admin"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Users",
//         href: "user.html",
//       },
//       {
//         roles: ["superadmin", "admin"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Manage Clients",
//         href: "manageClients.html",
//       },
//       {
//         roles: ["customer"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Reports",
//         href: "projectReport.html",
//       },

//       {
//         roles: ["superadmin"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Email Logs",
//         href: "emailLog.html",
//       },
//       // {
//       //   roles: ["superadmin"],
//       //   label: "Deactivated Projects",
//       //   href: "deactivatedProject.html",
//       // },
//       {
//         roles: ["superadmin"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Departments",
//         href: "branch.html",
//       },
//       {
//         roles: ["superadmin", "admin", "user"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Current Projects",
//         href: "project.html",
//       },
//       {
//         roles: ["superadmin", "admin", "user"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Completed Projects",
//         href: "completedProjects.html",
//       },
//       {
//         roles: ["superadmin", "admin", "user"],
//         branches: ["all", planingBranch, excelBranch],
//         label: "Client Projects",
//         href: "ourClients.html",
//       },

//       // {
//       //   roles: ["superadmin", "admin", "user", "customer"],
//       //   label: "Detailed Report",
//       //   href: "detailedReport.html",
//       // },
//       // {
//       //   roles: ["superadmin", "admin", "user", "customer"],
//       //   label: "Reports",
//       //   href: "projectReport.html",
//       // },
//     ];
//     const adminOnlyItems = menuItems.filter(
//       (item) => !item.roles.includes("user") && !item.roles.includes("customer")
//     );
//     const regularItems = menuItems.filter(
//       (item) => item.roles.includes("user") || item.roles.includes("customer")
//     );

//     const hasAdminItems = adminOnlyItems.some(
//       (item) => item.roles.includes(role) && item.branches.includes(branch)
//     );

//     if (hasAdminItems) {
//       const toggleLi = document.createElement("li");
//       toggleLi.innerHTML =
//         '<a class="dropdown-item admin-toggle" style="cursor: pointer;"><i class="fas fa-tools me-2"></i>Admin Tools <i class="fas fa-chevron-down ms-2" style="float: right;"></i></a>';
//       dropdownMenu.insertBefore(toggleLi, dropdownMenu.firstChild);
//       adminOnlyItems
//         .slice()
//         .reverse()
//         .forEach((item) => {
//           if (item.roles.includes(role) && item.branches.includes(branch)) {
//             const li = document.createElement("li");
//             li.className = "admin-item";
//             li.style.display = "none";
//             li.innerHTML = `<a class="dropdown-item" href="${
//               item.href
//             }" target="${item.target || "_self"}">${item.label}</a>`;
//             dropdownMenu.insertBefore(li, dropdownMenu.firstChild);
//           }
//         });

//       // Add click event to toggle admin items
//       const toggleLink = toggleLi.querySelector(".admin-toggle");
//       toggleLink.addEventListener("click", function (e) {
//         e.preventDefault();
//         e.stopPropagation();

//         const adminItems = dropdownMenu.querySelectorAll(".admin-item");
//         const chevron = toggleLink.querySelector(".fa-chevron-down");

//         const isVisible = adminItems[0].style.display !== "none";

//         adminItems.forEach((item) => {
//           item.style.display = isVisible ? "none" : "block";
//         });

//         // Rotate chevron
//         if (chevron) {
//           chevron.style.transform = isVisible
//             ? "rotate(0deg)"
//             : "rotate(180deg)";
//         }
//       });
//       const separatorLi = document.createElement("li");
//       separatorLi.innerHTML = '<hr class="dropdown-divider">';
//       dropdownMenu.insertBefore(separatorLi, dropdownMenu.firstChild);
//     }

//     // Add regular items first
//     regularItems.forEach((item) => {
//       if (item.roles.includes(role) && item.branches.includes(branch)) {
//         const li = document.createElement("li");
//         li.innerHTML = `<a class="dropdown-item" href="${item.href}" target="${
//           item.target || "_self"
//         }">${item.label}</a>`;
//         dropdownMenu.insertBefore(li, dropdownMenu.firstChild);
//       }
//     });

//     // Add admin items directly to main menu with a separator (initially hidden)
//   }
// });

document.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(localStorage.getItem("user"));

  if (user && user.name) {
    document.getElementById("engineerNameDisplay").textContent = user.name;
  } else if (user && user.email) {
    document.getElementById("engineerNameDisplay").textContent = user.email;
  }

  // Add CSS for submenu

  const style = document.createElement("style");

  style.textContent = `

    .dropdown-submenu {

      position: relative;

    }

    .dropdown-submenu .submenu {

      display: none;

      min-width: 200px;

      z-index: 1050;

      box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);

      border: 1px solid rgba(0, 0, 0, 0.15);

      border-radius: 0.375rem;

    }

    .dropdown-submenu .dropdown-item.dropdown-toggle::after {

      display: none;

    }

    .dropdown-submenu .dropdown-item.dropdown-toggle {

      position: relative;

      cursor: pointer;

    }

    .dropdown-submenu .dropdown-item.dropdown-toggle i {

      position: absolute;

      right: 10px;

      top: 50%;

      transform: translateY(-50%);

      transition: transform 0.2s;

    }

    .dropdown-submenu.open .dropdown-item.dropdown-toggle i {

      transform: translateY(-50%) rotate(180deg);

    }

    .admin-toggle i.fa-chevron-down {

      transition: transform 0.2s;

    }

    .dropdown-submenu .submenu .dropdown-item {

      padding: 0.375rem 1rem;

    }

  `;

  document.head.appendChild(style);

});

function handleUnauthorized(message = "Please login again") {
  console.log("Unauthorized access blocked (serverless mode):", message);
}

let loginToken = localStorage.getItem("token") || "mock-token";

if (!loginToken) {
  // console.error("No token found");
  // window.location.href = "./login.html";
}

function getUserIdFromToken(loginToken) {
  try {
    const payload = JSON.parse(atob(loginToken.split(".")[1]));
    return payload.id || payload._id;
  } catch (err) {
    console.error("Invalid token");
    return null;
  }
}

const USER_ID = getUserIdFromToken(loginToken);

// const socket = io("http://localhost:5000");
const socket = {
    on: () => {},
    emit: () => {}
};
// socket.emit("join", USER_ID);

let notifications = [];

socket.on("notification", () => {
  fetchUnreadCount();
});

async function fetchUnreadCount() {
  // const res = await fetch(`${API_URL}/notification/unread-count`, {
  const res = await fetch(`${API_URL}/notification/`, {
    headers: { Authorization: `Bearer ${loginToken}` },
  });
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    handleUnauthorized?.(data.message || "Unauthorized");
    return;
  }
  const count = await res.json();
  // console.log("RESPONSE OF NOTIFICATION :" + JSON.stringify(count));
  notifications = count;
  // console.log("NOTIFICATION SIZE :" + count.length);
  // const { count } = await res.json();
  document.getElementById("unreadCount").innerText = count.length || "";
}

fetchUnreadCount();

async function loadNotifications() {
  const res = await fetch("/notifications", {
    headers: { Authorization: `Bearer ${loginToken}` },
  });
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    handleUnauthorized?.(data.message || "Unauthorized");
    return;
  }
  const data = await res.json();

  const list = document.getElementById("notifList");
  list.innerHTML = "";

  data.forEach((n) => {
    const li = document.createElement("li");
    li.className = n.isRead ? "" : "fw-bold";
    li.innerHTML = `
      ${n.title}<br>
      <small>${n.message}</small>
    `;
    li.onclick = async () => {
      await fetch(`/notifications/${n._id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${loginToken}` },
      });
      fetchUnreadCount();
      // redirect using n.refId
    };
    list.appendChild(li);
  });
}

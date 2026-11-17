document.addEventListener("DOMContentLoaded", async () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const signupContainer = document.getElementById("signup-container");
  const messageDiv = document.getElementById("message");
  const accountMenuToggle = document.getElementById("account-menu-toggle");
  const accountMenuPanel = document.getElementById("account-menu-panel");
  const accountStatus = document.getElementById("account-status");
  const accountMessage = document.getElementById("account-message");
  const loginOpenButton = document.getElementById("login-open");
  const logoutButton = document.getElementById("logout-button");
  const loginDialog = document.getElementById("login-dialog");
  const loginForm = document.getElementById("login-form");
  const loginCancelButton = document.getElementById("login-cancel");
  const authMessage = document.getElementById("auth-message");
  let teacherAuthenticated = false;

  function updateAuthControls(username = "") {
    signupContainer.hidden = !teacherAuthenticated;
    loginOpenButton.hidden = teacherAuthenticated;
    logoutButton.hidden = !teacherAuthenticated;
    accountStatus.textContent = teacherAuthenticated
      ? `Logged in as ${username}`
      : "Student view (read-only)";
  }

  function displayMessage(element, message, className) {
    element.textContent = message;
    element.className = className;
    element.classList.remove("hidden");
  }

  async function fetchAuthStatus() {
    const response = await fetch("/auth/status");
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || "Unable to check teacher login status.");
    }

    teacherAuthenticated = result.authenticated;
    updateAuthControls(result.username || "");
  }

  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      if (!response.ok) {
        throw new Error(activities.detail || "Unable to load activities.");
      }

      activitiesList.innerHTML = "";
      while (activitySelect.options.length > 1) {
        activitySelect.remove(1);
      }

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
                <h5>Participants:</h5>
                <ul class="participants-list">
                  ${details.participants
                    .map(
                      (email) => `<li>
                        <span class="participant-email">${email}</span>
                        ${
                          teacherAuthenticated
                            ? `<button class="delete-btn" data-activity="${name}" data-email="${email}" aria-label="Remove ${email} from ${name}">❌</button>`
                            : ""
                        }
                      </li>`
                    )
                    .join("")}
                </ul>
              </div>`
            : "<p><em>No participants yet</em></p>";

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">${participantsHTML}</div>
        `;

        activitiesList.appendChild(activityCard);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function handleUnregister(event) {
    if (!teacherAuthenticated) {
      return;
    }

    const button = event.currentTarget;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      const result = await response.json();

      if (response.ok) {
        displayMessage(messageDiv, result.message, "success");
        await fetchActivities();
      } else {
        displayMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      displayMessage(
        messageDiv,
        "Failed to unregister. Please try again.",
        "error"
      );
      console.error("Error unregistering:", error);
    }

    setTimeout(() => messageDiv.classList.add("hidden"), 5000);
  }

  accountMenuToggle.addEventListener("click", () => {
    const isExpanded = accountMenuToggle.getAttribute("aria-expanded") === "true";
    accountMenuToggle.setAttribute("aria-expanded", String(!isExpanded));
    accountMenuPanel.classList.toggle("hidden", isExpanded);
  });

  loginOpenButton.addEventListener("click", () => {
    accountMenuPanel.classList.add("hidden");
    accountMenuToggle.setAttribute("aria-expanded", "false");
    authMessage.classList.add("hidden");
    loginDialog.showModal();
  });

  loginCancelButton.addEventListener("click", () => loginDialog.close());

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authMessage.classList.add("hidden");
    const formData = new FormData(loginForm);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        displayMessage(
          authMessage,
          result.detail || "Unable to log in.",
          "error"
        );
        return;
      }

      teacherAuthenticated = true;
      updateAuthControls(result.username);
      loginForm.reset();
      loginDialog.close();
      await fetchActivities();
    } catch (error) {
      displayMessage(authMessage, "Unable to log in. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  logoutButton.addEventListener("click", async () => {
    accountMessage.classList.add("hidden");

    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to log out.");
      }

      teacherAuthenticated = false;
      updateAuthControls();
      await fetchActivities();
    } catch (error) {
      displayMessage(
        accountMessage,
        "Unable to log out. Please try again.",
        "error"
      );
      console.error("Error logging out:", error);
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!teacherAuthenticated) {
      return;
    }

    const email = document.getElementById("email").value;
    const activity = activitySelect.value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        { method: "POST" }
      );
      const result = await response.json();

      if (response.ok) {
        displayMessage(messageDiv, result.message, "success");
        signupForm.reset();
        await fetchActivities();
      } else {
        displayMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      displayMessage(
        messageDiv,
        "Failed to sign up. Please try again.",
        "error"
      );
      console.error("Error signing up:", error);
    }

    setTimeout(() => messageDiv.classList.add("hidden"), 5000);
  });

  try {
    await fetchAuthStatus();
  } catch (error) {
    accountStatus.textContent = "Teacher status unavailable (read-only mode)";
    console.error("Error checking teacher login status:", error);
  }
  await fetchActivities();
});

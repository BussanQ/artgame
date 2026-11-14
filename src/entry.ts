if (new URLSearchParams(location.search).get("mode") === "online") {
  void import("./online/client");
} else {
  void import("./main");
}

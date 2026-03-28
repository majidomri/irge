export function createState(usersPerPage) {
  return {
    allUsers: [],
    filteredUsers: [],
    displayedUsers: [],
    currentPage: 1,
    usersPerPage,
    loading: false,
    activeDataSource: "",

    filters: {
      search: "",
      id: "",
      gender: "all",
      education: "",
      sort: "dateDesc",
    },

    appliedFilters: [],

    typing: {
      texts: [
        "Find Verified Muslim Rishta for Nikah",
      ],
      disableAnimation: true,
      textIndex: 0,
      charIndex: 0,
      direction: "forward",
      speed: 150,
      pause: 1500,
      timerId: null,
    },
  };
}

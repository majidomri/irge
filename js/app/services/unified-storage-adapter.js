// Unified Storage Adapter for Admin Studio
// Combines IndexedDB (for bios/ads) and localStorage (for profiles)

class UnifiedStorageAdapter {
  constructor() {
    this.indexedDBService = null;
    this.localStorageService = null;
  }

  async init() {
    // Initialize IndexedDB for bio data
    const { StorageService } =
      await import("./js/app/services/storage-service.js");
    this.indexedDBService = new StorageService();
    await this.indexedDBService.init();

    // Initialize localStorage for profiles
    const { DataService } = await import("./js/app/services/data-service.js");
    this.localStorageService = new DataService();
    await this.localStorageService.init();
  }

  // Bio operations (IndexedDB)
  async saveBio(data) {
    return await this.indexedDBService.saveBio(data);
  }

  async getBio(id) {
    return await this.indexedDBService.getBio(id);
  }

  async updateBio(id, data) {
    return await this.indexedDBService.updateBio(id, data);
  }

  async deleteBio(id) {
    return await this.indexedDBService.deleteBio(id);
  }

  async getBioIds() {
    return await this.indexedDBService.getBioIds();
  }

  async getBioCount() {
    return await this.indexedDBService.getBioCount();
  }

  async bioExists(id) {
    return await this.indexedDBService.bioExists(id);
  }

  async importBios(data) {
    return await this.indexedDBService.importBios(data);
  }

  async exportBios() {
    return await this.indexedDBService.exportBios();
  }

  async saveAds(bioId, ads) {
    return await this.indexedDBService.saveAds(bioId, ads);
  }

  async getAds(bioId) {
    return await this.indexedDBService.getAds(bioId);
  }

  // Profile operations (localStorage)
  async saveProfile(profile) {
    return await this.localStorageService.saveProfile(profile);
  }

  async getProfile(id) {
    return await this.localStorageService.getProfile(id);
  }

  async updateProfile(id, data) {
    return await this.localStorageService.updateProfile(id, data);
  }

  async deleteProfile(id) {
    return await this.localStorageService.deleteProfile(id);
  }

  async getAllProfiles() {
    return await this.localStorageService.getAllProfiles();
  }

  async importProfiles(data) {
    return await this.localStorageService.importProfiles(data);
  }

  async exportProfiles() {
    return await this.localStorageService.exportProfiles();
  }

  // Shared operations
  async clearAll() {
    await this.indexedDBService.clearAll();
    await this.localStorageService.clearAll();
  }

  // Draft management for profiles
  saveDraft(data) {
    this.localStorageService.saveDraft(data);
  }

  loadDraft() {
    return this.localStorageService.loadDraft();
  }

  clearDraft() {
    this.localStorageService.clearDraft();
  }

  hasDraft() {
    return this.localStorageService.hasDraft();
  }
}

export { UnifiedStorageAdapter };

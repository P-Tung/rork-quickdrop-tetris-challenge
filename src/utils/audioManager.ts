/**
 * Audio Manager for Tetris Game - React Native (expo-av)
 * Loads combo sound once and plays with pitch variation based on combo count
 */

import { Audio } from "expo-av";

class AudioManager {
  private sound: Audio.Sound | null = null;
  private isInitialized = false;
  private isPlaying = false;

  /**
   * Initialize expo-av and load the combo sound
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set audio mode for optimal playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Load the audio file
      await this.loadSound();

      this.isInitialized = true;
    } catch (error) {
      console.error("❌ Failed to initialize audio:", error);
    }
  }

  /**
   * Load the combo sound file
   */
  private async loadSound(): Promise<void> {
    try {
      // Create and load the sound
      const { sound } = await Audio.Sound.createAsync(
        require("../../power_up_fx.mp3"),
        {
          shouldPlay: false,
          volume: 1.0,
        },
      );

      this.sound = sound;
    } catch (error) {
      console.error("❌ Failed to load sound:", error);
      throw error;
    }
  }

  /**
   * Play combo sound with pitch variation
   * @param comboCount - Current combo count (1-based)
   */
  async playComboSound(comboCount: number): Promise<void> {
    if (!this.isInitialized || !this.sound) {
      console.warn("⚠️  Audio not initialized or sound not loaded");
      return;
    }

    try {
      // Calculate pitch: combo 1 = 1.0, each additional combo +0.05, max 1.5
      const pitch = Math.min(1.0 + (comboCount - 1) * 0.05, 1.5);

      // Stop current playback if playing
      const status = await this.sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await this.sound.stopAsync();
      }

      // Set playback position to start and apply pitch
      await this.sound.setPositionAsync(0);
      await this.sound.setRateAsync(pitch, true); // true = correct pitch

      // Play the sound
      await this.sound.playAsync();
    } catch (error) {
      console.error("❌ [AUDIO] Failed to play combo sound:", error);
    }
  }

  /**
   * Check if audio is ready
   */
  isReady(): boolean {
    return this.isInitialized && !!this.sound;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
    }

    this.isInitialized = false;
  }
}

// Export singleton instance
export const audioManager = new AudioManager();

// Export function for easy access
export const playComboSound = (comboCount: number) => {
  audioManager.playComboSound(comboCount);
};

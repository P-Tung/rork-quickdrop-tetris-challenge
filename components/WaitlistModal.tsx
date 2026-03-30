import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { X, Mail, CheckCircle2 } from "lucide-react-native";
import { firestore } from "@/lib/firebase";
import { LinearGradient } from "expo-linear-gradient";

interface WaitlistModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export const WaitlistModal: React.FC<WaitlistModalProps> = ({
  isVisible,
  onClose,
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await firestore().collection("waitlist").add({
        email: email.trim().toLowerCase(),
        platform: "ios",
        source: "landing_page",
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Error submitting waitlist:", err);
      setError("Failed to join waitlist. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <LinearGradient colors={["#1e293b", "#0f172a"]} style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Coming Soon to iOS</Text>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <X color="#fff" size={24} />
            </Pressable>
          </View>

          {submitted ? (
            <View style={styles.successContainer}>
              <CheckCircle2 color="#4ade80" size={64} />
              <Text style={styles.successTitle}>You're on the list!</Text>
              <Text style={styles.successText}>
                We'll notify you as soon as the iOS version is available.
              </Text>
              <TouchableOpacity style={styles.okButton} onPress={handleClose}>
                <Text style={styles.okButtonText}>Awesome</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.description}>
                Join our waitlist to be first in line when we launch on the
                Apple App Store.
              </Text>

              <View style={styles.inputContainer}>
                <Mail
                  color="rgba(255,255,255,0.4)"
                  size={20}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#020617" />
                ) : (
                  <Text style={styles.submitButtonText}>Notify Me</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    width: "100%",
    maxWidth: 450,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 24,
    marginBottom: 24,
  },
  form: {
    width: "100%",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    color: "#fb7185",
    fontSize: 14,
    marginBottom: 16,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: "#22d3ee",
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#22d3ee",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#020617",
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    marginTop: 20,
    marginBottom: 12,
  },
  successText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  okButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  okButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

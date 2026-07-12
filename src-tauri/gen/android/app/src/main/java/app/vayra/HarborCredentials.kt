package app.vayra

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypted credential storage backed by the Android Keystore — the mobile
 * counterpart of the desktop OS keyring (see settings_store.rs). A
 * non-exportable AES-256-GCM key lives in the Keystore under a stable alias;
 * each credential is stored as an `IV || ciphertext+tag` blob in the
 * app-private `filesDir/harbor-credentials/<account>` file.
 *
 * Only called from Rust through JNI reflection — keep method signatures in
 * sync with settings_store.rs and the `-keep` rule in proguard-rules.pro.
 */
object HarborCredentials {
    private const val KEY_ALIAS = "harbor-auth"
    private const val KEYSTORE = "AndroidKeyStore"
    private const val DIR_NAME = "harbor-credentials"
    private const val CIPHER = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_BYTES = 12

    /** Returns the decrypted credential, or null when none is stored. */
    @JvmStatic
    fun read(context: Context, account: String): String? {
        val file = credentialFile(context, account)
        if (!file.exists()) return null
        val blob = AtomicFile(file).openRead().use { it.readBytes() }
        check(blob.size > GCM_IV_BYTES) { "corrupt credential blob for $account" }
        val cipher = Cipher.getInstance(CIPHER)
        val accountBytes = account.toByteArray(Charsets.UTF_8)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(),
            GCMParameterSpec(GCM_TAG_BITS, blob, 0, GCM_IV_BYTES),
        )
        cipher.updateAAD(accountBytes)
        val plain = cipher.doFinal(blob, GCM_IV_BYTES, blob.size - GCM_IV_BYTES)
        return String(plain, Charsets.UTF_8)
    }

    /** Encrypts and persists the credential (atomic write via rename). */
    @JvmStatic
    fun write(context: Context, account: String, value: String) {
        val cipher = Cipher.getInstance(CIPHER)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(account.toByteArray(Charsets.UTF_8))
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val file = credentialFile(context, account)
        file.parentFile?.mkdirs()
        val atomic = AtomicFile(file)
        val stream = atomic.startWrite()
        try {
            stream.write(cipher.iv + ciphertext)
            stream.fd.sync()
            atomic.finishWrite(stream)
        } catch (error: Throwable) {
            atomic.failWrite(stream)
            throw error
        }
    }

    /** Removes the stored credential; a missing entry is not an error. */
    @JvmStatic
    fun delete(context: Context, account: String) {
        AtomicFile(credentialFile(context, account)).delete()
    }

    private fun credentialFile(context: Context, account: String): File {
        // Defense in depth: the Rust side already restricts account names.
        require(
            account.isNotEmpty() &&
                account.length <= 128 &&
                account != "." &&
                account != ".." &&
                account.all { it.isLetterOrDigit() || it in "-_:." },
        ) { "invalid credential account" }
        return File(File(context.filesDir, DIR_NAME), account)
    }

    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }
}

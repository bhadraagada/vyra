import { useAuth, useSignIn } from "@clerk/expo"
import { Redirect } from "expo-router"
import { useState } from "react"
import { KeyboardAvoidingView, Text } from "react-native"
import { Button, ErrorText, Field } from "../src/ui"

/** Email code sign-in. Accounts are made in the Clerk dashboard or on the web app. */
export default function SignIn() {
  const { isSignedIn } = useAuth()
  const { signIn, fetchStatus } = useSignIn()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = fetchStatus === "fetching"

  if (isSignedIn) return <Redirect href="/" />

  async function sendCode() {
    setError(null)
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email.trim() })
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verify() {
    setError(null)
    const { error } = await signIn.emailCode.verifyCode({ code: code.trim() })
    if (error) return setError(error.message)
    if (signIn.status !== "complete") return setError("Sign-in needs another step that VYRA does not support.")
    const done = await signIn.finalize()
    if (done.error) setError(done.error.message)
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 justify-center gap-6 bg-black px-6">
      <Text className="text-3xl font-semibold text-white">VYRA</Text>
      {sent ? (
        <>
          <Text className="text-base text-white">Enter the code sent to {email.trim()}.</Text>
          <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" autoFocus />
          <Button title="Sign in" tone="primary" disabled={busy || code.trim() === ""} onPress={() => void verify()} />
          <Button title="Use another email" onPress={() => { setSent(false); setCode(""); void signIn.reset() }} />
        </>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoFocus />
          <Button title="Send code" tone="primary" disabled={busy || !email.includes("@")} onPress={() => void sendCode()} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </KeyboardAvoidingView>
  )
}

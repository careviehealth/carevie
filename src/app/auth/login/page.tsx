import LoginClient from "./LoginClient";

type PageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const returnTo = params?.returnTo ?? null;
  return <LoginClient returnTo={returnTo} />;
}

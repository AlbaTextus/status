import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ id?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const { id } = await searchParams;
  if (id) {
    redirect(`/incidents/${id}`);
  }
  redirect("/history");
}
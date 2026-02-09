import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

interface LegalDisclaimerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LegalDisclaimer = ({
  open,
  onOpenChange,
}: LegalDisclaimerProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <DialogTitle>Legal Disclaimer</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Important information about this educational site
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-2">
          <div className="space-y-4 pb-6 pr-4">
            <section className="space-y-2">
              <h3 className="font-semibold text-sm">
                Not Affiliated with Cloudflare
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This website is an educational community project and is not
                endorsed, affiliated with, or sponsored by Cloudflare, Inc. The
                PeakPass simulation is an independent creation designed to help
                the community understand quota management and rate limiting
                concepts.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-sm">Educational Purpose</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This tool is provided for educational and demonstrative purposes
                only. It simulates quota and throttling mechanisms but is not an
                official Cloudflare tool or product. Any resemblance to actual
                Cloudflare systems is coincidental and for learning purposes.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-sm">Community Contribution</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This project is maintained by the developer community to
                facilitate learning about distributed systems, quota management,
                and API rate limiting concepts. It is not a replacement for
                official Cloudflare documentation or support.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-sm">No Warranty</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This tool is provided "as is" without any warranty or guarantee
                of accuracy. The information and simulations presented are for
                educational purposes and should not be considered definitive for
                production decision making.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-sm">
                Cloudflare® Trademark Notice
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cloudflare is a registered trademark of Cloudflare, Inc. This
                site and its creators are not affiliated with, endorsed by, or
                related to Cloudflare, Inc. The use of "Cloudflare" in this
                project is for educational reference only.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-sm">Liability</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The creators and maintainers of this educational tool shall not
                be liable for any damages, losses, or issues arising from the
                use or misuse of this tool. Use at your own discretion.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-sm">Questions or Concerns?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you have questions about this tool or believe there are
                trademark or copyright concerns, please contact the project
                maintainers directly.
              </p>
            </section>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground italic">
                Last Updated: February 2026
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

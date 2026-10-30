import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "agendi"

const disabledLink = { "aria-disabled": true, tabIndex: -1, className: "pointer-events-none opacity-50" }

export const ListFooter = () => (
  <div className="flex items-center gap-6">
    <p className="text-sm text-muted-foreground tabular-nums">41–60 de 187 agendamentos</p>
    <Pagination className="mx-0 w-auto">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" className="tabular-nums">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" className="tabular-nums">2</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive className="tabular-nums">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" className="tabular-nums">4</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" className="tabular-nums">10</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  </div>
)

export const FirstPage = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" {...disabledLink} />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive className="tabular-nums">1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" className="tabular-nums">2</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" className="tabular-nums">3</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext href="#" />
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)

export const LastPage = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" className="tabular-nums">1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" className="tabular-nums">7</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive className="tabular-nums">8</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext href="#" {...disabledLink} />
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)

export const CustomLabels = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" text="Semana anterior" />
      </PaginationItem>
      <PaginationItem>
        <PaginationNext href="#" text="Próxima semana" />
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)
